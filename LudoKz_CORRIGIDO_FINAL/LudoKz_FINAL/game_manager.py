"""game_manager.py — Matchmaking 2-4 jogadores + motor C++"""
import ctypes, os, json, threading, uuid, time
from dataclasses import dataclass, field
from typing import Optional, List

# Motor C++
_SO = os.path.join(os.path.dirname(__file__), "ludo_engine.so")
if os.name == "nt": _SO = _SO.replace(".so", ".dll")

ENGINE_OK = False
_lib = None
try:
    _lib = ctypes.CDLL(_SO)
    _lib.ludo_create.restype          = ctypes.c_void_p
    _lib.ludo_destroy.argtypes        = [ctypes.c_void_p]
    _lib.ludo_init.argtypes           = [ctypes.c_void_p, ctypes.c_int, ctypes.c_char_p,
                                          ctypes.c_int, ctypes.c_char_p, ctypes.c_int]
    _lib.ludo_roll_dice.restype       = ctypes.c_int
    _lib.ludo_roll_dice.argtypes      = [ctypes.c_void_p]
    _lib.ludo_has_moves.restype       = ctypes.c_int
    _lib.ludo_has_moves.argtypes      = [ctypes.c_void_p]
    _lib.ludo_movable_pieces.restype  = ctypes.c_int
    _lib.ludo_movable_pieces.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int)]
    _lib.ludo_move_piece.restype      = ctypes.c_int
    _lib.ludo_move_piece.argtypes     = [ctypes.c_void_p, ctypes.c_int, ctypes.c_char_p]
    _lib.ludo_pass_turn.argtypes      = [ctypes.c_void_p]
    _lib.ludo_to_json.argtypes        = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_int]
    _lib.ludo_is_over.restype         = ctypes.c_int
    _lib.ludo_is_over.argtypes        = [ctypes.c_void_p]
    _lib.ludo_get_winner.restype      = ctypes.c_int
    _lib.ludo_get_winner.argtypes     = [ctypes.c_void_p]
    _lib.ludo_get_turn.restype        = ctypes.c_int
    _lib.ludo_get_turn.argtypes       = [ctypes.c_void_p]
    _lib.ludo_get_phase.restype       = ctypes.c_int
    _lib.ludo_get_phase.argtypes      = [ctypes.c_void_p]
    ENGINE_OK = True
except Exception:
    pass  # Usa motor Python


@dataclass
class Player:
    user_id: int
    name:    str
    idx:     int   # 0-3
    color:   str   # r g b y
    fin:     int = 0
    pcs:     List[int] = field(default_factory=lambda: [0,0,0,0])
    ib:      List[bool] = field(default_factory=lambda: [True,True,True,True])

COLORS = ['r','g','b','y']
COLOR_NAMES = {'r':'Vermelho','g':'Verde','b':'Azul','y':'Amarelo'}

@dataclass
class Room:
    rid:      str
    bet:      float
    tier:     str
    max_p:    int = 2   # 2, 3 ou 4
    players:  List[Player] = field(default_factory=list)
    started:  bool = False
    over:     bool = False
    turn:     int = 0
    dice:     int = 0
    phase:    int = 0   # 0=roll 1=move
    rnd:      int = 1
    max_rnd:  int = 80
    winner_ids: List[int] = field(default_factory=list)
    loser_ids:  List[int] = field(default_factory=list)
    prize:    float = 0.0
    rounds:   int = 0
    log:      List[str] = field(default_factory=list)
    ptr:      int = 0   # C++ pointer (apenas para 2 jogadores)
    consec6:  int = 0
    created:  float = field(default_factory=time.time)

    def lobby_dict(self):
        return {"id": self.rid, "bet": self.bet, "tier": self.tier,
                "players": len(self.players), "max": self.max_p,
                "host": self.players[0].name if self.players else ""}

    def state(self):
        return {
            "room_id":  self.rid,
            "bet":      self.bet,
            "tier":     self.tier,
            "max_p":    self.max_p,
            "started":  self.started,
            "over":     self.over,
            "turn":     self.turn,
            "dice":     self.dice,
            "phase":    self.phase,
            "round":    self.rnd,
            "max_round":self.max_rnd,
            "log":      self.log[-20:],
            "players": [{
                "user_id": p.user_id, "name": p.name,
                "idx": p.idx, "color": p.color,
                "color_name": COLOR_NAMES[p.color],
                "fin": p.fin,
                "pos": p.pcs,
                "in_base": p.ib
            } for p in self.players]
        }

    def cur_player(self):
        if self.turn < len(self.players):
            return self.players[self.turn]
        return None

    def add_log(self, msg):
        self.log.append(msg)
        if len(self.log) > 50: self.log.pop(0)


class GameManager:
    def __init__(self):
        self._rooms: dict[str, Room] = {}
        self._lk = threading.Lock()

    def lobby(self):
        with self._lk:
            now = time.time()
            # Limpar salas antigas sem jogadores (30 min)
            stale = [rid for rid, r in self._rooms.items()
                     if not r.started and now - r.created > 1800]
            for rid in stale: del self._rooms[rid]
            return [r.lobby_dict() for r in self._rooms.values()
                    if not r.started and len(r.players) < r.max_p]

    def create_room(self, uid, name, bet, tier, max_p=2):
        max_p = max(2, min(4, int(max_p)))
        rid = str(uuid.uuid4())[:8].upper()
        p = Player(user_id=uid, name=name, idx=0, color=COLORS[0])
        r = Room(rid=rid, bet=bet, tier=tier, max_p=max_p, players=[p])
        with self._lk:
            self._rooms[rid] = r
        return rid

    def join_room(self, rid, uid, name):
        with self._lk:
            r = self._rooms.get(rid)
            if not r:                      return False, "Sala não encontrada."
            if r.started:                  return False, "Jogo já iniciado."
            if len(r.players) >= r.max_p:  return False, "Sala cheia."
            if any(p.user_id==uid for p in r.players): return False, "Já estás nesta sala."
            idx = len(r.players)
            p = Player(user_id=uid, name=name, idx=idx, color=COLORS[idx])
            r.players.append(p)
        return True, "OK"

    def start_game(self, rid):
        with self._lk:
            r = self._rooms.get(rid)
            if not r or r.started: return None
            if len(r.players) < 2: return None
            r.started = True
            r.add_log(f"🎮 Jogo iniciado com {len(r.players)} jogadores!")
            for p in r.players:
                r.add_log(f"  {COLOR_NAMES[p.color]}: {p.name}")
        return self._rooms[rid].state()

    def get_state(self, rid):
        r = self._rooms.get(rid)
        return r.state() if r else None

    def get_room(self, rid):
        return self._rooms.get(rid)

    def roll(self, rid, uid):
        with self._lk:
            r = self._rooms.get(rid)
            if not r or not r.started or r.over: return None
            cur = r.cur_player()
            if not cur or cur.user_id != uid: return None
            if r.phase != 0: return None
            import random
            v = random.randint(1, 6)
            r.dice = v
            r.phase = 1
            # Incrementar consec6 ANTES de verificar (para move() usar o valor correcto)
            if v == 6:
                r.consec6 += 1
            else:
                r.consec6 = 0
            pl = r.players[r.turn]
            has = self._has_moves(pl, v)
            if not has:
                r.add_log(f"🎲 {pl.name} tirou {v} — sem jogadas, passa a vez")
                self._next_turn(r)
            else:
                r.add_log(f"🎲 {pl.name} tirou {v}")
        return r.state()

    def _has_moves(self, pl, dice):
        """Verifica se o jogador tem alguma jogada válida."""
        for i in range(4):
            if pl.ib[i]:
                if dice == 6: return True
            else:
                if pl.pcs[i] + dice <= 58: return True
        return False

    def _is_blocked(self, r, attacker, dest_global):
        """Verifica se uma casa está bloqueada por 2+ peças adversárias."""
        OFF = {'r': 0, 'g': 26, 'b': 13, 'y': 39}
        for opp in r.players:
            if opp.user_id == attacker.user_id: continue
            count = sum(
                1 for i in range(4)
                if not opp.ib[i] and opp.pcs[i] < 52
                and (OFF[opp.color] + opp.pcs[i] - 1) % 52 + 1 == dest_global
            )
            if count >= 2: return True
        return False

    def movable(self, rid, uid):
        with self._lk:
            r = self._rooms.get(rid)
            if not r or not r.started: return []
            cur = r.cur_player()
            if not cur or cur.user_id != uid: return []
            pl = r.players[r.turn]
            mv = []
            for i in range(4):
                if pl.ib[i]:
                    if r.dice == 6: mv.append(i)
                else:
                    if pl.pcs[i] + r.dice <= 58: mv.append(i)
            return mv

    def move(self, rid, uid, piece):
        with self._lk:
            r = self._rooms.get(rid)
            if not r or not r.started or r.over: return None
            cur = r.cur_player()
            if not cur or cur.user_id != uid: return None
            if r.phase != 1: return None
            pl = r.players[r.turn]
            captured = False

            # Validar e executar movimento
            if pl.ib[piece]:
                if r.dice != 6: return None
                pl.ib[piece] = False; pl.pcs[piece] = 1
                r.add_log(f"🚀 {pl.name}: peça {piece+1} saiu da base!")
            else:
                np = pl.pcs[piece] + r.dice
                if np > 58: return None
                # Check if destination is blocked BEFORE moving
                if np < 52:
                    OFF = {'r': 0, 'g': 26, 'b': 13, 'y': 39}
                    g_dest = (OFF[pl.color] + np - 1) % 52 + 1
                    if self._is_blocked(r, pl, g_dest):
                        r.add_log(f"🛡️ {pl.name}: casa bloqueada! Escolhe outra peça.")
                        return None  # Reject move entirely - player must pick another piece
                pl.pcs[piece] = np
                if np == 58:
                    pl.fin += 1
                    r.add_log(f"🏁 {pl.name}: peça {piece+1} chegou ao fim! ({pl.fin}/4)")
                    if pl.fin == 4:
                        r.over = True
                        r.winner_ids = [pl.user_id]
                        r.loser_ids  = [p.user_id for p in r.players if p.user_id != pl.user_id]
                        r.prize  = round(r.bet * len(r.players) * 0.95, 2)
                        r.rounds = r.rnd
                        r.add_log(f"🏆 {pl.name} VENCEU! Prémio: {r.prize:,.0f} Kz")
                        return r.state()
                else:
                    r.add_log(f"➡️ {pl.name}: peça {piece+1} avançou {r.dice} (pos {np})")
                    captured = self._check_capture(r, pl, piece, np)

            # Decidir próxima acção
            # Prioridade: captura > dado=6 > normal
            if captured:
                # Bónus por captura — joga novamente
                r.phase = 0
                r.add_log(f"🎯 {pl.name} joga novamente (capturou peça)!")
            elif r.dice == 6 and r.consec6 < 3:
                # Bónus por 6 — joga novamente
                r.phase = 0
                r.add_log(f"🎯 {pl.name} joga novamente (tirou 6)!")
            else:
                if r.consec6 >= 3:
                    r.consec6 = 0  # Reset before next_turn resets it too
                    r.add_log(f"⚠️ {pl.name}: 3 seises seguidos — perde a vez!")
                self._next_turn(r)
        return r.state()

    def _check_capture(self, r, attacker, piece, pos):
        """Verifica e executa capturas. Retorna True se capturou alguma peça."""
        if pos >= 52: return False  # reta final — sem captura
        SAFE_GLOBAL = {1, 9, 14, 22, 27, 35, 40, 48}
        OFF = {'r': 0, 'g': 26, 'b': 13, 'y': 39}
        g_att = (OFF[attacker.color] + pos - 1) % 52 + 1
        if g_att in SAFE_GLOBAL: return False  # casa segura

        # Verificar bloqueio: 2+ peças da mesma cor adversária = não pode entrar
        for opp in r.players:
            if opp.user_id == attacker.user_id: continue
            opp_here = sum(
                1 for i in range(4)
                if not opp.ib[i] and opp.pcs[i] < 52
                and (OFF[opp.color] + opp.pcs[i] - 1) % 52 + 1 == g_att
            )
            if opp_here >= 2:
                r.add_log(f"🛡️ {attacker.name}: bloqueio de {opp.name}! Não podes entrar.")
                return False  # bloqueio — sem captura

        # Executar captura (uma peça por adversário na casa)
        captured = False
        for opp in r.players:
            if opp.user_id == attacker.user_id: continue
            for i in range(4):
                if opp.ib[i] or opp.pcs[i] >= 52: continue
                og = (OFF[opp.color] + opp.pcs[i] - 1) % 52 + 1
                if og == g_att:
                    opp.ib[i] = True; opp.pcs[i] = 0
                    r.add_log(f"💥 {attacker.name} comeu peça de {opp.name}!")
                    captured = True
                    break  # captura 1 peça do adversário e passa para o próximo
        return captured

    def _next_turn(self, r):
        r.consec6 = 0
        r.phase = 0
        r.turn = (r.turn + 1) % len(r.players)
        r.rnd += 1
        if r.rnd > r.max_rnd and not r.over:
            # Desempate: quem tem mais peças no fim
            if not r.players: return  # Guard against empty players
            best = max(r.players, key=lambda p: (p.fin, sum(1 for x in p.pcs if x > 0)))
            r.over = True
            r.winner_ids = [best.user_id]
            r.loser_ids  = [p.user_id for p in r.players if p.user_id != best.user_id]
            r.prize  = round(r.bet * len(r.players) * 0.95, 2)
            r.rounds = r.rnd
            r.add_log(f"⏱️ Tempo esgotado! {best.name} vence por pontos!")

    def remove_room(self, rid):
        with self._lk:
            self._rooms.pop(rid, None)

    def force_win(self, rid, winner_uid):
        with self._lk:
            r = self._rooms.get(rid)
            if not r or r.over: return None
            r.over = True
            r.prize = round(r.bet * len(r.players) * 0.95, 2)
            r.winner_ids = [winner_uid]
            r.loser_ids  = [p.user_id for p in r.players if p.user_id != winner_uid]
        return r

    def find_by_user(self, uid):
        with self._lk:
            for rid, r in self._rooms.items():
                if any(p.user_id == uid for p in r.players): return rid
        return None


    def bot_move(self, rid, bot_uid):
        """Bot automático para o admin testar sozinho"""
        import time, random
        r = self._rooms.get(rid)
        if not r or not r.started or r.over: return None
        cur = r.cur_player()
        if not cur or cur.user_id != bot_uid: return None
        
        # Roll
        state = self.roll(rid, bot_uid)
        if not state: return None
        
        time.sleep(0.3)  # pequena pausa para parecer humano
        
        # Escolher peça (estratégia simples: mover a peça mais avançada)
        mv = self.movable(rid, bot_uid)
        if not mv: return state
        
        # Estratégia: preferir peças mais à frente
        r2 = self._rooms.get(rid)
        if not r2: return state
        pl = next((p for p in r2.players if p.user_id == bot_uid), None)
        if not pl: return state
        
        best = max(mv, key=lambda i: pl.pcs[i] if not pl.ib[i] else -1)
        result = self.move(rid, bot_uid, best)
        return result

gm = GameManager()

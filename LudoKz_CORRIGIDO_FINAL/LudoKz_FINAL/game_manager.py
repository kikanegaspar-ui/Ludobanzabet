"""
game_manager.py — Motor de Jogo LudoKz CORRIGIDO
Bugs corrigidos:
  1. Peças saem da base com dado 6 (unlock correto)
  2. state_dict envia in_base[] para o frontend
  3. roll_dice não auto-move quando há escolha — devolve movable ao frontend
  4. _do_move usa índice correto para tokens na base
  5. _check_capture não captura peças já em casa
"""

import random
from copy import deepcopy

# ══════════════════════════════════════════════════════════════════
#  PESOS DO BOT
# ══════════════════════════════════════════════════════════════════
WEIGHTS = {
    "UNLOCK_BONUS":                      50000,
    "CAPTURE_BASE":                      60000,
    "OPPONENT_PROGRESS_MULTIPLIER":       1000,
    "HOME_ENTRY_BONUS":                  20000,
    "SAFE_TOKEN_MOVE_PENALTY":           10000,
    "SAFE_POSITION_BONUS":               5000,
    "GOAL_COMPLETION_BONUS":            150000,
    "BASE_DISTANCE_PENALTY":              150,
    "CROWDED_EXIT_BONUS":               10000,
    "UNSAFE_STACKING_PENALTY":          65000,
    "SAFE_HUNT_CRITICAL_RANGE_BONUS":   20000,
    "SAFE_CHASE_BASE_BONUS":            15000,
    "RISKY_CHASE_BASE_BONUS":           10000,
    "RISKY_HUNT_CRITICAL_RANGE_BONUS":  15000,
    "HIGH_INVESTMENT_ESCAPE_PRIORITY":  55000,
    "LOW_INVESTMENT_ESCAPE_PRIORITY":   42000,
    "ESCAPE_DISTANCE_MULTIPLIER":        5000,
    "CRITICAL_ESCAPE_BONUS":            20000,
    "SAFE_HAVEN_BONUS":                 35000,
    "UNSAFE_ESCAPE_PENALTY":            10000,
    "SAFE_SPOT_ABANDONMENT_PENALTY":   100000,
    "SAFE_SPOT_EXIT_PENALTY":            5000,
    "STACK_SPLIT_BONUS":                 2000,
    "IMMINENT_CAPTURE_PENALTY":        120000,
}

LOGIC_CONFIG = {
    "UNLOCK_DICE_VALUE":        6,
    "TOKENS_PER_PLAYER":        4,
    "MAX_CHASE_LOOKAHEAD":      15,
    "MAX_THREAT_LOOKAHEAD":     12,
    "RISKY_HUNT_RANGE":         8,
    "CRITICAL_COMBAT_RANGE":    6,
    "HIGH_INVESTMENT_DIST":     25,
    "ENDGAME_TOKEN_COUNT":      3,
    "SAFETY_TOKEN_COUNT":       2,
    "ENDGAME_SCORE_MULTIPLIER": 10,
    "SAFETY_SCORE_MULTIPLIER":  2,
    "DEFAULT_MULTIPLIER":       1,
    "DANGER_ZONE_RANGE":        9,
}

# ══════════════════════════════════════════════════════════════════
#  IDs de base e corredor por cor (alinhados com CMAP do frontend)
# ══════════════════════════════════════════════════════════════════
BASE_IDS = {
    "blue":   [500, 501, 502, 503],
    "green":  [600, 601, 602, 603],
    "red":    [700, 701, 702, 703],
    "yellow": [800, 801, 802, 803],
}

HOME_ENTRY_IDS = {
    "blue":   [100, 101, 102, 103, 104, 105],
    "green":  [200, 201, 202, 203, 204, 205],
    "red":    [300, 301, 302, 303, 304, 305],
    "yellow": [400, 401, 402, 403, 404, 405],
}

HOME_ID = {
    "blue": 105, "green": 205, "red": 305, "yellow": 405,
}

# Posição de saída da base (primeiro ID no tabuleiro principal por cor)
START_POS_ID = {
    "blue":   0,
    "green":  26,
    "red":    39,
    "yellow": 13,
}

# Ponto de viragem para entrar no corredor final por cor
TURN_PT_ID = {
    "blue":   50,   # posição 50 → entra em 100
    "green":  24,   # posição 24 → entra em 200
    "red":    37,   # posição 37 → entra em 300
    "yellow": 11,   # posição 11 → entra em 400
}

# ══════════════════════════════════════════════════════════════════
#  CAMINHOS COMPLETOS por cor (IDs numéricos, 0-51 + corredor final)
# ══════════════════════════════════════════════════════════════════
def _build_full_path(colour):
    """
    Constrói o caminho completo de IDs para uma cor:
    começa em START_POS_ID, percorre o tabuleiro principal (0-51),
    e entra no corredor final.
    """
    start   = START_POS_ID[colour]
    turn_pt = TURN_PT_ID[colour]
    lane    = HOME_ENTRY_IDS[colour]

    main = []
    pos = start
    for _ in range(53):  # máximo 52 passos no tabuleiro principal
        main.append(pos)
        if pos == turn_pt:
            break
        pos = (pos + 1) % 52

    return main + lane


FULL_PATH = {
    "blue":   _build_full_path("blue"),
    "green":  _build_full_path("green"),
    "red":    _build_full_path("red"),
    "yellow": _build_full_path("yellow"),
}

# Conjunto de IDs que são posições seguras (não capturáveis)
_SAFE_IDS = {
    0, 13, 26, 39,      # casas de saída
    8, 21, 34, 47,      # casas seguras intermédias
    # corredores finais — todos seguros
    100,101,102,103,104,105,
    200,201,202,203,204,205,
    300,301,302,303,304,305,
    400,401,402,403,404,405,
}

# Conjunto de IDs de base
_BASE_ID_SET = {
    500,501,502,503,
    600,601,602,603,
    700,701,702,703,
    800,801,802,803,
}


def _is_safe_id(pos_id):
    return pos_id in _SAFE_IDS or pos_id in _BASE_ID_SET


def _get_next_pos(colour, current_id, steps):
    """
    Avança 'steps' casas no caminho da cor a partir de current_id.
    Devolve o novo ID, ou None se ultrapassar o fim.
    """
    path = FULL_PATH[colour]
    try:
        idx = path.index(current_id)
    except ValueError:
        return None
    new_idx = idx + steps
    if new_idx >= len(path):
        return None
    return path[new_idx]


def _steps_to_home(colour, current_id):
    """Quantos passos faltam para chegar a casa."""
    path = FULL_PATH[colour]
    try:
        idx = path.index(current_id)
    except ValueError:
        return -1
    return len(path) - 1 - idx


# ══════════════════════════════════════════════════════════════════
#  LÓGICA DE TOKENS — usa IDs numéricos directamente
# ══════════════════════════════════════════════════════════════════

def get_movable_tokens(player, dice_number):
    """
    Devolve lista de índices de peças que podem mover com este dado.
    - Peça na base: só pode sair se dado == 6
    - Peça no tabuleiro/corredor: pode mover se não ultrapassar a casa final
    - Peça em casa (has_reached_home): nunca move
    """
    movable = []
    for i, token in enumerate(player["tokens"]):
        if token["has_reached_home"]:
            continue
        if token["is_locked"]:
            # Sai da base apenas com dado 6
            if dice_number == LOGIC_CONFIG["UNLOCK_DICE_VALUE"]:
                movable.append(i)
        else:
            # Verifica se pode avançar sem ultrapassar a casa final
            colour = player["colour"]
            next_id = _get_next_pos(colour, token["pos_id"], dice_number)
            if next_id is not None:
                movable.append(i)
    return movable


# ══════════════════════════════════════════════════════════════════
#  BOT IA — simplificada e correcta com IDs numéricos
# ══════════════════════════════════════════════════════════════════

def select_best_token_for_bot(player, dice_number, all_players):
    """Escolhe o melhor índice de peça para o bot mover."""
    movable = get_movable_tokens(player, dice_number)
    if not movable:
        return None
    if len(movable) == 1:
        return movable[0]

    colour    = player["colour"]
    home_id   = HOME_ID[colour]
    best_idx  = movable[0]
    best_score = float("-inf")

    for i in movable:
        token = player["tokens"][i]
        score = 0

        if token["is_locked"]:
            score += WEIGHTS["UNLOCK_BONUS"]
            # Verificar se a casa de saída está livre de adversários
            start_id = START_POS_ID[colour]
            for op in all_players:
                if op["user_id"] == player["user_id"]:
                    continue
                for ot in op["tokens"]:
                    if not ot["is_locked"] and not ot["has_reached_home"]:
                        if ot["pos_id"] == start_id:
                            score += WEIGHTS["CAPTURE_BASE"]
        else:
            next_id = _get_next_pos(colour, token["pos_id"], dice_number)
            if next_id is None:
                continue

            # Chegar a casa
            if next_id == home_id:
                score += WEIGHTS["GOAL_COMPLETION_BONUS"]

            # Capturar adversário
            if not _is_safe_id(next_id):
                for op in all_players:
                    if op["user_id"] == player["user_id"]:
                        continue
                    for ot in op["tokens"]:
                        if not ot["is_locked"] and not ot["has_reached_home"]:
                            if ot["pos_id"] == next_id:
                                dist = _steps_to_home(op["colour"], next_id)
                                score += WEIGHTS["CAPTURE_BASE"] + max(0, 52 - dist) * WEIGHTS["OPPONENT_PROGRESS_MULTIPLIER"] // 100

            # Casa segura é bonus
            if _is_safe_id(next_id):
                score += WEIGHTS["SAFE_POSITION_BONUS"]

            # Prefere peças mais perto de casa
            dist = _steps_to_home(colour, token["pos_id"])
            score -= dist * WEIGHTS["BASE_DISTANCE_PENALTY"] // 100

            # Penalizar entrar em perigo
            if not _is_safe_id(next_id):
                for op in all_players:
                    if op["user_id"] == player["user_id"]:
                        continue
                    for ot in op["tokens"]:
                        if not ot["is_locked"] and not ot["has_reached_home"]:
                            ot_next = _get_next_pos(op["colour"], ot["pos_id"], 6)
                            if ot_next == next_id:
                                score -= WEIGHTS["IMMINENT_CAPTURE_PENALTY"] // 10

        if score > best_score:
            best_score = score
            best_idx = i

    return best_idx


# ══════════════════════════════════════════════════════════════════
#  GESTOR DE JOGO
# ══════════════════════════════════════════════════════════════════

class GameManager:

    COLOUR_ORDER = ["blue", "red", "green", "yellow"]

    def __init__(self, room_id, bet, max_players, host_user_id, host_name):
        self.room_id     = room_id
        self.bet         = bet
        self.max_players = max_players
        self.players     = []
        self.turn        = 0
        self.phase       = 0   # 0=lançar dado, 1=mover peça
        self.dice        = 0
        self.round       = 0
        self.over        = False
        self.winner      = None
        self.log         = []
        self.consecutive_sixes = 0
        self.started     = False
        self._add_player(host_user_id, host_name)

    # ── Gestão de jogadores ──────────────────────────────────────

    def _colour_for_index(self, idx):
        return self.COLOUR_ORDER[idx % len(self.COLOUR_ORDER)]

    def _add_player(self, user_id, name):
        idx    = len(self.players)
        colour = self._colour_for_index(idx)
        tokens = self._gen_tokens(colour)
        self.players.append({
            "user_id": user_id,
            "name":    name,
            "colour":  colour,
            "idx":     idx,
            "tokens":  tokens,
            "fin":     0,
            "is_bot":  False,
        })

    def _gen_tokens(self, colour):
        """Cria 4 tokens na base com pos_id correcto."""
        base_ids = BASE_IDS[colour]
        tokens = []
        for i in range(4):
            tokens.append({
                "id":               i,
                "colour":           colour,
                "pos_id":           base_ids[i],   # ID numérico para o frontend
                "is_locked":        True,
                "has_reached_home": False,
            })
        return tokens

    def add_player(self, user_id, name):
        if self.started:
            return False, "Jogo já iniciado."
        if len(self.players) >= self.max_players:
            return False, "Sala cheia."
        if any(p["user_id"] == user_id for p in self.players):
            return False, "Já estás na sala."
        self._add_player(user_id, name)
        return True, None

    def remove_player(self, user_id):
        self.players = [p for p in self.players if p["user_id"] != user_id]

    def player_count(self):
        return len(self.players)

    def get_player(self, user_id):
        return next((p for p in self.players if p["user_id"] == user_id), None)

    def get_current_player(self):
        if not self.players:
            return None
        return self.players[self.turn % len(self.players)]

    # ── Início do jogo ──────────────────────────────────────────

    def start(self):
        if self.started:
            return False, "Jogo já iniciado."
        if len(self.players) < 2:
            return False, "Mínimo 2 jogadores."
        self.started = True
        self.turn    = 0
        self.phase   = 0
        self._log(f"🎮 Jogo iniciado com {len(self.players)} jogadores!")
        return True, None

    # ── Rolar dado ──────────────────────────────────────────────

    def roll_dice(self, user_id):
        """
        Rola o dado. Devolve (value, error).
        NÃO auto-move — o frontend escolhe a peça.
        Só passa a vez automaticamente se não há jogadas possíveis.
        """
        if not self.started or self.over:
            return None, "Jogo não está em curso."
        cur = self.get_current_player()
        if not cur or cur["user_id"] != user_id:
            return None, "Não é o teu turno."
        if self.phase != 0:
            return None, "Já rolaste o dado."

        value      = random.randint(1, 6)
        self.dice  = value
        self.phase = 1

        self._log(f"🎲 {cur['name']} tirou {value}")

        movable = get_movable_tokens(cur, value)

        if not movable:
            # Sem jogadas — passa a vez
            self._log(f"↩️ {cur['name']} sem jogadas possíveis, passa a vez")
            self.phase = 0
            self.dice  = 0
            self._next_turn(rolled_six=(value == 6))

        return value, None

    # ── Peças movíveis ──────────────────────────────────────────

    def get_movable(self, user_id):
        cur = self.get_current_player()
        if not cur or cur["user_id"] != user_id or self.phase != 1:
            return []
        return get_movable_tokens(cur, self.dice)

    # ── Mover peça ──────────────────────────────────────────────

    def move_piece(self, user_id, piece_idx):
        if not self.started or self.over:
            return None, "Jogo não está em curso."
        cur = self.get_current_player()
        if not cur or cur["user_id"] != user_id:
            return None, "Não é o teu turno."
        if self.phase != 1:
            return None, "Tens de rolar o dado primeiro."

        movable = get_movable_tokens(cur, self.dice)
        if piece_idx not in movable:
            return None, "Peça não pode mover."

        self._do_move(cur, piece_idx)
        return self.state_dict(user_id), None

    def _do_move(self, player, piece_idx):
        token  = player["tokens"][piece_idx]
        colour = player["colour"]
        dice   = self.dice

        if token["is_locked"]:
            # Sair da base: coloca na posição de saída
            start_id = START_POS_ID[colour]
            token["pos_id"]    = start_id
            token["is_locked"] = False
            self._log(f"🚀 {player['name']}: peça {piece_idx + 1} saiu da base!")
            # Verificar captura na casa de saída
            self._check_capture(player, start_id)
        else:
            next_id = _get_next_pos(colour, token["pos_id"], dice)
            if next_id is None:
                # Não devia acontecer — movable já filtrou
                return

            token["pos_id"] = next_id

            if next_id == HOME_ID[colour]:
                token["has_reached_home"] = True
                player["fin"] += 1
                self._log(f"🏠 {player['name']}: peça {piece_idx + 1} chegou a casa!")
                if player["fin"] == 4:
                    self._end_game(player)
                    return
            else:
                self._log(f"♟️ {player['name']} moveu peça {piece_idx + 1}")
                self._check_capture(player, next_id)

        rolled_six = (dice == LOGIC_CONFIG["UNLOCK_DICE_VALUE"])
        self.phase = 0
        self.dice  = 0
        self._next_turn(rolled_six=rolled_six)

    def _check_capture(self, moving_player, pos_id):
        """Captura adversários na posição pos_id (se não for casa segura)."""
        if _is_safe_id(pos_id):
            return
        for player in self.players:
            if player["user_id"] == moving_player["user_id"]:
                continue
            for token in player["tokens"]:
                if token["is_locked"] or token["has_reached_home"]:
                    continue
                if token["pos_id"] == pos_id:
                    # Devolver à base
                    token["pos_id"]    = BASE_IDS[player["colour"]][token["id"]]
                    token["is_locked"] = True
                    self._log(f"💀 {moving_player['name']} capturou peça de {player['name']}!")

    # ── Turno seguinte ──────────────────────────────────────────

    def _next_turn(self, rolled_six=False):
        if rolled_six:
            self.consecutive_sixes += 1
            if self.consecutive_sixes >= 3:
                self.consecutive_sixes = 0
                self._log("⚠️ Três seis seguidos — perde a vez!")
                self._advance_turn()
            else:
                self._log(f"🎯 {self.get_current_player()['name']} joga novamente!")
                # Mantém o turno, apenas reinicia fase
        else:
            self.consecutive_sixes = 0
            self._advance_turn()

    def _advance_turn(self):
        n = len(self.players)
        if n == 0:
            return
        for _ in range(n):
            self.turn = (self.turn + 1) % n
            if self.players[self.turn]["fin"] < 4:
                break
        self.round += 1

    # ── Fim de jogo ─────────────────────────────────────────────

    def _end_game(self, winner_player):
        self.over   = True
        self.winner = winner_player["user_id"]
        self._log(f"🏆 {winner_player['name']} VENCEU a partida!")

    # ── Log ─────────────────────────────────────────────────────

    def _log(self, msg):
        self.log.append(msg)
        if len(self.log) > 50:
            self.log = self.log[-50:]

    # ── Bot ─────────────────────────────────────────────────────

    def bot_turn(self, bot_user_id):
        cur = self.get_current_player()
        if not cur or cur["user_id"] != bot_user_id:
            return None, "Não é o turno do bot."

        dice, err = self.roll_dice(bot_user_id)
        if err:
            return None, err

        # Se ainda está na fase 1 (há jogadas disponíveis)
        if self.phase == 1:
            best_idx = select_best_token_for_bot(cur, dice, self.players)
            if best_idx is not None:
                self._do_move(cur, best_idx)

        return self.state_dict(bot_user_id), None

    # ── Estado serializável ─────────────────────────────────────
    # Envia pos[] e in_base[] para o frontend (ludo_board_v2.js)

    def state_dict(self, requesting_user_id=None):
        players_out = []
        for p in self.players:
            pos_list     = []
            in_base_list = []

            for t in p["tokens"]:
                pos_list.append(t["pos_id"])
                in_base_list.append(1 if t["is_locked"] else 0)

            players_out.append({
                "user_id":  p["user_id"],
                "name":     p["name"],
                "color":    p["colour"],   # frontend usa "color"
                "colour":   p["colour"],
                "idx":      p["idx"],
                "fin":      p["fin"],
                "is_bot":   p["is_bot"],
                "pos":      pos_list,       # IDs numéricos → CMAP do frontend
                "in_base":  in_base_list,   # 1=na base, 0=em jogo
            })

        return {
            "room_id":  self.room_id,
            "bet":      self.bet,
            "players":  players_out,
            "turn":     self.turn,
            "phase":    self.phase,
            "dice":     self.dice,
            "round":    self.round,
            "over":     self.over,
            "winner":   self.winner,
            "log":      self.log[-20:],
            "started":  self.started,
        }

    def lobby_dict(self):
        host = self.players[0] if self.players else {}
        return {
            "id":      self.room_id,
            "bet":     self.bet,
            "players": len(self.players),
            "max":     self.max_players,
            "host":    host.get("name", "?"),
            "started": self.started,
        }

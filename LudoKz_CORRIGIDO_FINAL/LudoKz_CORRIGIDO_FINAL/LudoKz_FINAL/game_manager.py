"""
game_manager.py — LudoKz FINAL
- user_id sempre string (consistente com frontend)
- Pecas saem com dado 6
- state_dict inclui in_base[]
- roll_dice nao auto-move
- _isMyTurn funciona com comparacao de string
"""

import random

UNLOCK_DICE = 6

BASE_IDS = {
    "blue":   [500, 501, 502, 503],
    "green":  [600, 601, 602, 603],
    "red":    [700, 701, 702, 703],
    "yellow": [800, 801, 802, 803],
}
HOME_ID = {
    "blue": 105, "green": 205, "red": 305, "yellow": 405,
}
START_POS_ID = {
    "blue": 0, "green": 26, "red": 39, "yellow": 13,
}
TURN_PT_ID = {
    "blue": 50, "green": 24, "red": 37, "yellow": 11,
}
HOME_LANE = {
    "blue":   [100, 101, 102, 103, 104, 105],
    "green":  [200, 201, 202, 203, 204, 205],
    "red":    [300, 301, 302, 303, 304, 305],
    "yellow": [400, 401, 402, 403, 404, 405],
}

_SAFE_IDS = set([
    0, 13, 26, 39,
    8, 21, 34, 47,
    100,101,102,103,104,105,
    200,201,202,203,204,205,
    300,301,302,303,304,305,
    400,401,402,403,404,405,
])
_BASE_ID_SET = set([
    500,501,502,503,
    600,601,602,603,
    700,701,702,703,
    800,801,802,803,
])


def _build_path(colour):
    start   = START_POS_ID[colour]
    turn_pt = TURN_PT_ID[colour]
    lane    = HOME_LANE[colour]
    main    = []
    pos     = start
    for _ in range(53):
        main.append(pos)
        if pos == turn_pt:
            break
        pos = (pos + 1) % 52
    return main + lane


FULL_PATH = {c: _build_path(c) for c in ["blue","green","red","yellow"]}


def _next_pos(colour, current_id, steps):
    path = FULL_PATH[colour]
    try:
        idx = path.index(current_id)
    except ValueError:
        return None
    new_idx = idx + steps
    if new_idx >= len(path):
        return None
    return path[new_idx]


def _is_safe(pos_id):
    return pos_id in _SAFE_IDS or pos_id in _BASE_ID_SET


def get_movable(player, dice):
    movable = []
    for i, t in enumerate(player["tokens"]):
        if t["reached_home"]:
            continue
        if t["locked"]:
            if dice == UNLOCK_DICE:
                movable.append(i)
        else:
            if _next_pos(player["colour"], t["pos_id"], dice) is not None:
                movable.append(i)
    return movable


def _bot_pick(player, dice, all_players):
    movable = get_movable(player, dice)
    if not movable:
        return None
    if len(movable) == 1:
        return movable[0]
    colour = player["colour"]
    best_i = movable[0]
    best_s = float("-inf")
    for i in movable:
        t = player["tokens"][i]
        score = 0
        if t["locked"]:
            score += 50000
            nid = START_POS_ID[colour]
            for op in all_players:
                if op["user_id"] == player["user_id"]:
                    continue
                for ot in op["tokens"]:
                    if not ot["locked"] and not ot["reached_home"] and ot["pos_id"] == nid:
                        score += 60000
        else:
            nid = _next_pos(colour, t["pos_id"], dice)
            if nid is None:
                continue
            if nid == HOME_ID[colour]:
                score += 150000
            if not _is_safe(nid):
                for op in all_players:
                    if op["user_id"] == player["user_id"]:
                        continue
                    for ot in op["tokens"]:
                        if not ot["locked"] and not ot["reached_home"] and ot["pos_id"] == nid:
                            score += 60000
            if _is_safe(nid):
                score += 5000
            path = FULL_PATH[colour]
            try:
                dist = len(path) - 1 - path.index(t["pos_id"])
                score -= dist * 150
            except ValueError:
                pass
        if score > best_s:
            best_s = score
            best_i = i
    return best_i


class GameManager:

    COLOURS = ["blue", "red", "green", "yellow"]

    def __init__(self, room_id, bet, max_players, host_user_id, host_name):
        self.room_id     = room_id
        self.bet         = bet
        self.max_players = max_players
        self.players     = []
        self.turn        = 0
        self.phase       = 0   # 0=rolar, 1=mover
        self.dice        = 0
        self.round       = 0
        self.over        = False
        self.winner      = None
        self.log         = []
        self.consec_six  = 0
        self.started     = False
        self._add_player(host_user_id, host_name)

    def _add_player(self, user_id, name):
        idx    = len(self.players)
        colour = self.COLOURS[idx % len(self.COLOURS)]
        tokens = []
        for i in range(4):
            tokens.append({
                "id":           i,
                "pos_id":       BASE_IDS[colour][i],
                "locked":       True,
                "reached_home": False,
            })
        self.players.append({
            "user_id": str(user_id),
            "name":    name,
            "colour":  colour,
            "idx":     idx,
            "tokens":  tokens,
            "fin":     0,
            "is_bot":  False,
        })

    def add_player(self, user_id, name):
        if self.started:
            return False, "Jogo ja iniciado."
        if len(self.players) >= self.max_players:
            return False, "Sala cheia."
        uid = str(user_id)
        if any(p["user_id"] == uid for p in self.players):
            return False, "Ja estas na sala."
        self._add_player(uid, name)
        return True, None

    def remove_player(self, user_id):
        uid = str(user_id)
        self.players = [p for p in self.players if p["user_id"] != uid]

    def player_count(self):
        return len(self.players)

    def get_player(self, user_id):
        uid = str(user_id)
        return next((p for p in self.players if p["user_id"] == uid), None)

    def get_current_player(self):
        if not self.players:
            return None
        return self.players[self.turn % len(self.players)]

    def start(self):
        if self.started:
            return False, "Jogo ja iniciado."
        if len(self.players) < 2:
            return False, "Minimo 2 jogadores."
        self.started = True
        self.turn    = 0
        self.phase   = 0
        self._log(f"🎮 Jogo iniciado com {len(self.players)} jogadores!")
        return True, None

    # ── Rolar dado ──────────────────────────────────────────────
    def roll_dice(self, user_id):
        if not self.started or self.over:
            return None, "Jogo nao esta em curso."
        cur = self.get_current_player()
        uid = str(user_id)
        if not cur or cur["user_id"] != uid:
            return None, "Nao e o teu turno."
        if self.phase != 0:
            return None, "Ja rolaste o dado."

        value     = random.randint(1, 6)
        self.dice  = value
        self.phase = 1
        self._log(f"🎲 {cur['name']} tirou {value}")

        movable = get_movable(cur, value)
        if not movable:
            self._log(f"↩️ {cur['name']} sem jogadas, passa a vez")
            self.phase = 0
            self.dice  = 0
            self._next_turn(value == UNLOCK_DICE)

        return value, None

    # ── Movíveis ────────────────────────────────────────────────
    def get_movable(self, user_id):
        cur = self.get_current_player()
        uid = str(user_id)
        if not cur or cur["user_id"] != uid or self.phase != 1:
            return []
        return get_movable(cur, self.dice)

    # ── Mover peça ──────────────────────────────────────────────
    def move_piece(self, user_id, piece_idx):
        if not self.started or self.over:
            return None, "Jogo nao esta em curso."
        cur = self.get_current_player()
        uid = str(user_id)
        if not cur or cur["user_id"] != uid:
            return None, "Nao e o teu turno."
        if self.phase != 1:
            return None, "Tens de rolar o dado primeiro."
        movable = get_movable(cur, self.dice)
        if piece_idx not in movable:
            return None, "Peca nao pode mover."
        self._do_move(cur, piece_idx)
        return self.state_dict(uid), None

    def _do_move(self, player, piece_idx):
        token  = player["tokens"][piece_idx]
        colour = player["colour"]
        # FIX: guardar dice antes de o repor a 0
        dice   = self.dice

        if token["locked"]:
            start_id         = START_POS_ID[colour]
            token["pos_id"]  = start_id
            token["locked"]  = False
            self._log(f"🚀 {player['name']}: peca {piece_idx+1} saiu da base!")
            # FIX: repor phase e dice ANTES de _check_capture
            # para que o estado enviado ao cliente seja sempre consistente
            self.phase = 0
            self.dice  = 0
            self._check_capture(player, start_id)
            self._next_turn(dice == UNLOCK_DICE)
        else:
            nid = _next_pos(colour, token["pos_id"], dice)
            if nid is None:
                return
            token["pos_id"] = nid
            # FIX: repor phase e dice ANTES de qualquer log ou captura
            self.phase = 0
            self.dice  = 0
            if nid == HOME_ID[colour]:
                token["reached_home"] = True
                player["fin"] += 1
                self._log(f"🏠 {player['name']}: peca {piece_idx+1} chegou a casa!")
                if player["fin"] == 4:
                    self._end_game(player)
                    return
            else:
                self._log(f"♟️ {player['name']} moveu peca {piece_idx+1}")
                self._check_capture(player, nid)
            self._next_turn(dice == UNLOCK_DICE)

    def _check_capture(self, moving_player, pos_id):
        if _is_safe(pos_id):
            return
        for player in self.players:
            if player["user_id"] == moving_player["user_id"]:
                continue
            for token in player["tokens"]:
                if token["locked"] or token["reached_home"]:
                    continue
                if token["pos_id"] == pos_id:
                    token["pos_id"] = BASE_IDS[player["colour"]][token["id"]]
                    token["locked"] = True
                    self._log(f"💀 {moving_player['name']} capturou peca de {player['name']}!")

    def _next_turn(self, rolled_six=False):
        if rolled_six:
            self.consec_six += 1
            if self.consec_six >= 3:
                self.consec_six = 0
                self._log("⚠️ Tres seis seguidos — perde a vez!")
                self._advance_turn()
            # senao mantem turno (joga novamente)
        else:
            self.consec_six = 0
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

    def _end_game(self, winner):
        self.over   = True
        self.winner = winner["user_id"]
        self._log(f"🏆 {winner['name']} VENCEU!")

    def _log(self, msg):
        self.log.append(msg)
        if len(self.log) > 50:
            self.log = self.log[-50:]

    def bot_turn(self, bot_user_id):
        uid = str(bot_user_id)
        cur = self.get_current_player()
        if not cur or cur["user_id"] != uid:
            return None, "Nao e o turno do bot."
        dice, err = self.roll_dice(uid)
        if err:
            return None, err
        if self.phase == 1:
            best = _bot_pick(cur, dice, self.players)
            if best is not None:
                self._do_move(cur, best)
        return self.state_dict(uid), None

    # ── state_dict ──────────────────────────────────────────────
    def state_dict(self, requesting_user_id=None):
        players_out = []
        for p in self.players:
            pos_list  = [t["pos_id"] for t in p["tokens"]]
            base_list = [1 if t["locked"] else 0 for t in p["tokens"]]
            players_out.append({
                "user_id": p["user_id"],
                "name":    p["name"],
                "color":   p["colour"],
                "colour":  p["colour"],
                "idx":     p["idx"],
                "fin":     p["fin"],
                "is_bot":  p["is_bot"],
                "pos":     pos_list,
                "in_base": base_list,
            })
        return {
            "room_id": self.room_id,
            "bet":     self.bet,
            "players": players_out,
            "turn":    self.turn,
            "phase":   self.phase,
            "dice":    self.dice,
            "round":   self.round,
            "over":    self.over,
            "winner":  self.winner,
            "log":     self.log[-20:],
            "started": self.started,
        }

    def lobby_dict(self):
        host = self.players[0] if self.players else {}
        return {
            "id":      self.room_id,
            "bet":     self.bet,
            "players": len(self.players),
            "max":     self.max_players,
            "host":    host.get("name","?"),
            "started": self.started,
        }

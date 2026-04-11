"""
game_manager.py — Motor de Jogo LudoKz
Lógica 100% fiel ao LibreLudo (React/TypeScript → Python)
Caminhos exactos, bot com IA de pesos, capturas, casas seguras
Integração com Flask/SSE via app.py
"""

import random
from copy import deepcopy

# ══════════════════════════════════════════════════════════════════
#  PESOS DO BOT (idênticos ao selectBestTokenForBot.ts)
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
#  CAMINHOS (tradução exacta de paths.ts + constants.ts)
# ══════════════════════════════════════════════════════════════════

def _integers_between(a, b):
    """Replica getIntegersBetween do LibreLudo."""
    if a == b:
        return [a]
    start = min(a, b)
    end   = max(a, b)
    result = list(range(start, end + 1))
    if a > b:
        result = list(reversed(result))
    return result


def _expand_token_path(token_paths):
    """Replica expandTokenPath do LibreLudo."""
    expanded = []
    for seg in token_paths:
        sx, sy = seg["start"]
        ex, ey = seg["end"]
        is_vertical = (sx == ex)
        if is_vertical:
            static = sx
            coords = _integers_between(sy, ey)
            for c in coords:
                expanded.append((static, c))
        else:
            static = sy
            coords = _integers_between(sx, ex)
            for c in coords:
                expanded.append((c, static))
    return expanded


# Caminho geral (GENERAL_TOKEN_PATH em constants.ts)
# Formato: {"start": (x,y), "end": (x,y)}
GENERAL_TOKEN_PATH = [
    {"start": (6, 13), "end": (6,  9)},
    {"start": (5,  8), "end": (1,  8)},
    {"start": (0,  8), "end": (0,  6)},
    {"start": (1,  6), "end": (5,  6)},
    {"start": (6,  5), "end": (6,  1)},
    {"start": (6,  0), "end": (8,  0)},
    {"start": (8,  1), "end": (8,  5)},
    {"start": (9,  6), "end": (13, 6)},
    {"start": (14, 6), "end": (14, 8)},
    {"start": (13, 8), "end": (9,  8)},
    {"start": (8,  9), "end": (8, 13)},
    {"start": (8, 14), "end": (6, 14)},
]

# Retas finais (TOKEN_HOME_ENTRY_PATH em constants.ts)
TOKEN_HOME_ENTRY_PATH = {
    "blue":   {"start": (7, 13), "end": (7, 8)},
    "red":    {"start": (1,  7), "end": (6, 7)},
    "green":  {"start": (7,  1), "end": (7, 6)},
    "yellow": {"start": (13, 7), "end": (8, 7)},
}

# Coordenadas de início no caminho geral
TOKEN_START_COORDINATES = {
    "blue":   (6, 13),
    "red":    (1,  6),
    "green":  (8,  1),
    "yellow": (13, 8),
}

# Casas seguras (TOKEN_SAFE_COORDINATES em constants.ts)
TOKEN_SAFE_COORDINATES = set([
    (6, 13),   # blue start
    (1,  6),   # red start
    (8,  1),   # green start
    (13, 8),   # yellow start
    (8, 12),
    (2,  8),
    (6,  2),
    (12, 6),
])

# Coordenadas bloqueadas (posição inicial na base)
TOKEN_LOCKED_COORDINATES = {
    "blue":   [(1.5, 10.2), (3.5, 10.2), (1.5, 12.2), (3.5, 12.2)],
    "red":    [(1.5,  1.2), (3.5,  1.2), (1.5,  3.2), (3.5,  3.2)],
    "green":  [(10.5, 1.2), (12.5, 1.2), (10.5, 3.2), (12.5, 3.2)],
    "yellow": [(10.5,10.2), (12.5,10.2), (10.5,12.2), (12.5,12.2)],
}


def _build_expanded_home_entry():
    result = {}
    for colour, seg in TOKEN_HOME_ENTRY_PATH.items():
        result[colour] = _expand_token_path([seg])
    return result


def _gen_blue_path():
    general = _expand_token_path(GENERAL_TOKEN_PATH)[:-1]
    return general + _expand_home_entry["blue"]


def _gen_red_path():
    path = GENERAL_TOKEN_PATH[3:] + GENERAL_TOKEN_PATH[:3]
    return _expand_token_path(path)[:-1] + _expand_home_entry["red"]


def _gen_green_path():
    path = GENERAL_TOKEN_PATH[6:] + GENERAL_TOKEN_PATH[:6]
    return _expand_token_path(path)[:-1] + _expand_home_entry["green"]


def _gen_yellow_path():
    path = GENERAL_TOKEN_PATH[9:] + GENERAL_TOKEN_PATH[:9]
    return _expand_token_path(path)[:-1] + _expand_home_entry["yellow"]


# Construir paths
_expand_home_entry = _build_expanded_home_entry()

TOKEN_PATHS = {
    "blue":   _gen_blue_path(),
    "red":    _gen_red_path(),
    "green":  _gen_green_path(),
    "yellow": _gen_yellow_path(),
}

EXPANDED_GENERAL_PATH = _expand_token_path(GENERAL_TOKEN_PATH)


# ══════════════════════════════════════════════════════════════════
#  FUNÇÕES DE LÓGICA DE COORDENADAS (logic.ts → Python)
# ══════════════════════════════════════════════════════════════════

def coords_equal(c1, c2):
    return c1[0] == c2[0] and c1[1] == c2[1]


def get_distance_in_token_path(colour, initial_coord, target_coord):
    """Replica getDistanceInTokenPath."""
    path = TOKEN_PATHS[colour]
    try:
        i1 = next(i for i, c in enumerate(path) if coords_equal(c, initial_coord))
        i2 = next(i for i, c in enumerate(path) if coords_equal(c, target_coord))
        return abs(i1 - i2)
    except StopIteration:
        return -1


def get_home_coord_for_colour(colour):
    """Última coordenada do caminho — a casa de chegada."""
    return TOKEN_PATHS[colour][-1]


def get_final_coord(token, dice_number):
    """Replica getFinalCoord — retorna None se inválido."""
    path = TOKEN_PATHS[token["colour"]]
    try:
        idx = next(i for i, c in enumerate(path) if coords_equal(c, token["coordinates"]))
    except StopIteration:
        return None
    final_idx = idx + dice_number
    if final_idx >= len(path):
        return None
    return path[final_idx]


def is_coord_in_home_entry_path(coord, colour):
    """Replica isCoordInHomeEntryPathForColour."""
    return any(coords_equal(coord, c) for c in _expand_home_entry[colour])


def is_coord_safe(coord, colour=None):
    """Replica isCoordASafeSpot."""
    is_safe = any(coords_equal(coord, c) for c in TOKEN_SAFE_COORDINATES)
    if not colour:
        return is_safe
    return is_safe or is_coord_in_home_entry_path(coord, colour)


def are_tokens_on_overlapping_paths(token1, token2):
    """Replica areTokensOnOverlappingPaths."""
    c1 = token1["coordinates"]
    c2 = token2["coordinates"]
    path1 = TOKEN_PATHS[token1["colour"]]
    path2 = TOKEN_PATHS[token2["colour"]]

    try:
        idx1 = next(i for i, c in enumerate(path1) if coords_equal(c, c1))
        idx2 = next(i for i, c in enumerate(path2) if coords_equal(c, c2))
    except StopIteration:
        return False

    remaining1 = path1[idx1:]
    remaining2 = path2[idx2:]

    return (
        any(coords_equal(c, c2) for c in remaining1) or
        any(coords_equal(c, c1) for c in remaining2)
    )


def get_distance_between_tokens(token1, token2):
    """Replica getDistanceBetweenTokens."""
    if not are_tokens_on_overlapping_paths(token1, token2):
        return -1
    c1 = token1["coordinates"]
    c2 = token2["coordinates"]
    gen = EXPANDED_GENERAL_PATH
    try:
        i1 = next(i for i, c in enumerate(gen) if coords_equal(c, c1))
        i2 = next(i for i, c in enumerate(gen) if coords_equal(c, c2))
    except StopIteration:
        return -1
    n = len(gen)
    fwd = (i2 - i1 + n) % n
    bwd = (i1 - i2 + n) % n
    return min(fwd, bwd)


def is_token_ahead(token1, token2):
    """Replica isTokenAhead — True se token1 está à frente de token2."""
    if coords_equal(token1["coordinates"], token2["coordinates"]):
        return False
    if not are_tokens_on_overlapping_paths(token1, token2):
        return False

    path1 = TOKEN_PATHS[token1["colour"]]
    path2 = TOKEN_PATHS[token2["colour"]]
    c1    = token1["coordinates"]
    c2    = token2["coordinates"]
    min_dist = get_distance_between_tokens(token1, token2)

    try:
        idx2 = next(i for i, c in enumerate(path2) if coords_equal(c, c2))
        idx1 = next(i for i, c in enumerate(path1) if coords_equal(c, c1))
    except StopIteration:
        return False

    for i in range(idx2, len(path2)):
        if i - idx2 > min_dist:
            break
        if coords_equal(path2[i], c1):
            return True
    for i in range(idx1, len(path1)):
        if i - idx1 > min_dist:
            break
        if coords_equal(path1[i], c2):
            return False
    return False


# ══════════════════════════════════════════════════════════════════
#  LÓGICA DE TOKENS (logic.ts tokens → Python)
# ══════════════════════════════════════════════════════════════════

def get_available_steps(token):
    """Quantos passos tem disponíveis até ao fim."""
    return get_distance_in_token_path(
        token["colour"],
        token["coordinates"],
        get_home_coord_for_colour(token["colour"])
    )


def is_token_movable(token, dice_number=None):
    """Replica isTokenMovable."""
    if token["is_locked"] or token["has_reached_home"]:
        return False
    if dice_number is None:
        return True
    return get_available_steps(token) >= dice_number


def get_movable_tokens(player, dice_number):
    """Retorna índices das peças que podem mover com este dado."""
    movable = []
    for i, token in enumerate(player["tokens"]):
        if token["is_locked"]:
            if dice_number == LOGIC_CONFIG["UNLOCK_DICE_VALUE"]:
                movable.append(i)
        elif is_token_movable(token, dice_number):
            movable.append(i)
    return movable


# ══════════════════════════════════════════════════════════════════
#  BOT IA (selectBestTokenForBot.ts → Python)
# ══════════════════════════════════════════════════════════════════

def select_best_token_for_bot(bot_colour, dice_number, all_players):
    """
    Replica selectBestTokenForBot com todos os pesos.
    Retorna o índice da peça a mover, ou None.
    """
    all_tokens = [t for p in all_players for t in p["tokens"]]
    bot_tokens  = [t for t in all_tokens if t["colour"] == bot_colour]
    movable_bot = [t for t in bot_tokens if (
        (t["is_locked"] and dice_number == LOGIC_CONFIG["UNLOCK_DICE_VALUE"]) or
        (not t["is_locked"] and is_token_movable(t, dice_number))
    )]

    if not movable_bot:
        return None

    bot_home_coord  = get_home_coord_for_colour(bot_colour)
    bot_start_coord = TOKEN_PATHS[bot_colour][0]

    active_opponent_tokens = [
        t for t in all_tokens
        if t["colour"] != bot_colour
        and not t["is_locked"]
        and not t["has_reached_home"]
        and any(coords_equal(t["coordinates"], c) for c in EXPANDED_GENERAL_PATH)
    ]

    token_scores = []

    for token in bot_tokens:
        score = 0
        final_coord = None

        is_unlockable = (
            token["is_locked"] and
            not token["has_reached_home"] and
            dice_number == LOGIC_CONFIG["UNLOCK_DICE_VALUE"]
        )

        if is_unlockable:
            score += WEIGHTS["UNLOCK_BONUS"]
            final_coord = TOKEN_PATHS[token["colour"]][0]
        else:
            final_coord = get_final_coord(token, dice_number)
            if not is_token_movable(token, dice_number):
                token_scores.append((token, float("-inf")))
                continue

        if final_coord is None:
            token_scores.append((token, float("-inf")))
            continue

        is_final_safe   = is_coord_safe(final_coord, token["colour"])
        is_current_safe = is_coord_safe(token["coordinates"], token["colour"])
        bot_tokens_at_home = sum(1 for t in bot_tokens if t["has_reached_home"])

        endgame_mult = (
            LOGIC_CONFIG["ENDGAME_SCORE_MULTIPLIER"]
            if bot_tokens_at_home >= LOGIC_CONFIG["ENDGAME_TOKEN_COUNT"]
            else LOGIC_CONFIG["DEFAULT_MULTIPLIER"]
        )
        safety_mult = (
            LOGIC_CONFIG["SAFETY_SCORE_MULTIPLIER"]
            if bot_tokens_at_home > LOGIC_CONFIG["SAFETY_TOKEN_COUNT"]
            else LOGIC_CONFIG["DEFAULT_MULTIPLIER"]
        )

        # Capturar inimigos
        for opp in all_tokens:
            if opp["colour"] == bot_colour:
                continue
            if coords_equal(final_coord, opp["coordinates"]) and not is_coord_safe(opp["coordinates"], opp["colour"]):
                dist_to_end  = get_distance_in_token_path(opp["colour"], opp["coordinates"], get_home_coord_for_colour(opp["colour"]))
                dist_traveled = len(TOKEN_PATHS[opp["colour"]]) - dist_to_end
                score += WEIGHTS["CAPTURE_BASE"] + dist_traveled * WEIGHTS["OPPONENT_PROGRESS_MULTIPLIER"]

        # Casa segura
        if is_final_safe:
            score += WEIGHTS["SAFE_POSITION_BONUS"]

        # Entrar na reta final
        in_home_now    = is_coord_in_home_entry_path(token["coordinates"], token["colour"])
        will_be_home   = is_coord_in_home_entry_path(final_coord, token["colour"])
        if will_be_home and not in_home_now:
            score += WEIGHTS["HOME_ENTRY_BONUS"]
        if in_home_now:
            score -= WEIGHTS["SAFE_TOKEN_MOVE_PENALTY"]

        # Se ainda está bloqueado, terminar aqui
        if token["is_locked"]:
            token_scores.append((token, score))
            continue

        dist_from_home = get_distance_in_token_path(token["colour"], token["coordinates"], bot_home_coord)
        movable_bot_tokens = [t for t in bot_tokens if not t["is_locked"] and not t["has_reached_home"]]

        # Chegar a casa
        if dist_from_home == dice_number:
            score += WEIGHTS["GOAL_COMPLETION_BONUS"]

        # Penalidade de distância geral
        score -= dist_from_home * WEIGHTS["BASE_DISTANCE_PENALTY"] * endgame_mult

        # Sair de casa segura cheia de inimigos com 6
        opp_in_current = sum(1 for t in active_opponent_tokens if coords_equal(t["coordinates"], token["coordinates"]))
        is_crowded_safe_rolled6 = (
            dice_number == LOGIC_CONFIG["UNLOCK_DICE_VALUE"] and
            is_current_safe and
            opp_in_current > 0
        )
        if is_crowded_safe_rolled6:
            score += WEIGHTS["CROWDED_EXIT_BONUS"]

        # Evitar empilhar peças em casa não segura
        bot_in_final = sum(1 for t in movable_bot_tokens if coords_equal(t["coordinates"], final_coord))
        if bot_in_final > 0 and not is_final_safe:
            score -= WEIGHTS["UNSAFE_STACKING_PENALTY"]

        is_safe_launch_hunter = False
        has_refunded_distance = False

        # Lógica de caça e fuga
        for opp in active_opponent_tokens:
            future_token    = {**token, "coordinates": final_coord}
            is_ahead_future = is_token_ahead(future_token, opp)
            future_dist     = get_distance_between_tokens(future_token, opp)
            is_ahead_now    = is_token_ahead(token, opp)
            current_dist    = get_distance_between_tokens(token, opp)

            # CAÇA: estamos atrás deles
            if 1 <= current_dist <= LOGIC_CONFIG["MAX_CHASE_LOOKAHEAD"] and not is_ahead_now:
                is_threatened = any(
                    is_token_ahead(token, t) and
                    1 <= get_distance_between_tokens(token, t) <= LOGIC_CONFIG["MAX_THREAT_LOOKAHEAD"]
                    for t in active_opponent_tokens
                )
                if not is_threatened or is_final_safe:
                    if current_dist <= LOGIC_CONFIG["CRITICAL_COMBAT_RANGE"]:
                        score += WEIGHTS["SAFE_HUNT_CRITICAL_RANGE_BONUS"]
                    score += WEIGHTS["SAFE_CHASE_BASE_BONUS"]
                    if not is_threatened:
                        is_safe_launch_hunter = True
                elif current_dist <= LOGIC_CONFIG["RISKY_HUNT_RANGE"]:
                    score += WEIGHTS["RISKY_CHASE_BASE_BONUS"]
                    if current_dist <= LOGIC_CONFIG["CRITICAL_COMBAT_RANGE"]:
                        score += WEIGHTS["RISKY_HUNT_CRITICAL_RANGE_BONUS"]

            # FUGA: estamos à frente deles
            if (1 <= current_dist <= LOGIC_CONFIG["MAX_THREAT_LOOKAHEAD"] and
                    is_ahead_now and not is_current_safe):
                dist_from_start = len(TOKEN_PATHS[token["colour"]]) - dist_from_home
                if dist_from_start > LOGIC_CONFIG["HIGH_INVESTMENT_DIST"]:
                    score += WEIGHTS["HIGH_INVESTMENT_ESCAPE_PRIORITY"]
                else:
                    score += WEIGHTS["LOW_INVESTMENT_ESCAPE_PRIORITY"]

            if future_dist >= 1 and future_dist <= LOGIC_CONFIG["MAX_THREAT_LOOKAHEAD"] and is_ahead_future:
                threats = [
                    t for t in active_opponent_tokens
                    if is_token_ahead(future_token, t) and
                    1 <= get_distance_between_tokens(future_token, t) <= LOGIC_CONFIG["DANGER_ZONE_RANGE"]
                ]
                is_going_into_danger = (
                    is_ahead_future and not is_ahead_now and
                    not is_final_safe and len(threats) > 0
                )
                if is_going_into_danger:
                    dist_from_start = len(TOKEN_PATHS[token["colour"]]) - dist_from_home
                    score -= WEIGHTS["IMMINENT_CAPTURE_PENALTY"] * len(threats) * max(1, dist_from_start / 2)

                is_escaping = is_ahead_now and future_dist > current_dist and not is_current_safe
                if is_escaping or (is_final_safe and is_ahead_now and not is_current_safe):
                    if is_escaping:
                        score += (future_dist - current_dist) * WEIGHTS["ESCAPE_DISTANCE_MULTIPLIER"]
                    if current_dist <= LOGIC_CONFIG["CRITICAL_COMBAT_RANGE"]:
                        if is_escaping:
                            score += WEIGHTS["CRITICAL_ESCAPE_BONUS"]
                        if not has_refunded_distance:
                            score += dist_from_home * WEIGHTS["BASE_DISTANCE_PENALTY"] * endgame_mult
                            has_refunded_distance = True
                    if is_final_safe:
                        score += WEIGHTS["SAFE_HAVEN_BONUS"]
                    elif is_escaping:
                        score -= WEIGHTS["UNSAFE_ESCAPE_PENALTY"]
                else:
                    is_protected = is_final_safe or will_be_home
                    if not is_protected and is_current_safe and not is_going_into_danger:
                        score -= WEIGHTS["SAFE_SPOT_ABANDONMENT_PENALTY"] * safety_mult

        # Ficar em casa segura (sem motivo para sair)
        bot_in_current = sum(1 for t in movable_bot_tokens if coords_equal(t["coordinates"], token["coordinates"]))
        if is_current_safe and not is_safe_launch_hunter and not is_crowded_safe_rolled6:
            score -= WEIGHTS["SAFE_SPOT_EXIT_PENALTY"]
        elif bot_in_current > 1:
            score += bot_in_current * WEIGHTS["STACK_SPLIT_BONUS"]

        token_scores.append((token, score))

    if not token_scores:
        return None

    max_score = max(s for _, s in token_scores)
    best = [t for t, s in token_scores if s == max_score]
    chosen = random.choice(best)
    return chosen["id"]


# ══════════════════════════════════════════════════════════════════
#  GESTOR DE JOGO
# ══════════════════════════════════════════════════════════════════

class GameManager:
    """
    Gere o estado de uma partida de Ludo.
    Integra com app.py via room_id e SSE.
    """

    COLOUR_ORDER = ["blue", "red", "green", "yellow"]

    def __init__(self, room_id, bet, max_players, host_user_id, host_name):
        self.room_id     = room_id
        self.bet         = bet
        self.max_players = max_players
        self.players     = []          # lista de dicts
        self.turn        = 0           # índice do jogador actual
        self.phase       = 0           # 0=rolar dado, 1=mover peça
        self.dice        = 0
        self.round       = 0
        self.over        = False
        self.winner      = None
        self.log         = []
        self.consecutive_sixes = 0
        self.started     = False

        # Adicionar o host
        self._add_player(host_user_id, host_name)

    # ──────────────────────────────────────────
    #  GESTÃO DE JOGADORES
    # ──────────────────────────────────────────

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
            "fin":     0,          # peças que chegaram a casa
            "is_bot":  False,
        })

    def _gen_tokens(self, colour):
        locked_coords = TOKEN_LOCKED_COORDINATES[colour]
        start_coord   = TOKEN_PATHS[colour][0]
        tokens = []
        for i in range(4):
            tokens.append({
                "id":              i,
                "colour":          colour,
                "coordinates":     locked_coords[i],
                "is_locked":       True,
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

    # ──────────────────────────────────────────
    #  INÍCIO DO JOGO
    # ──────────────────────────────────────────

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

    # ──────────────────────────────────────────
    #  ROLAR DADO
    # ──────────────────────────────────────────

    def roll_dice(self, user_id):
        if not self.started or self.over:
            return None, "Jogo não está em curso."
        cur = self.get_current_player()
        if not cur or cur["user_id"] != user_id:
            return None, "Não é o teu turno."
        if self.phase != 0:
            return None, "Já rolaste o dado."

        value = random.randint(1, 6)
        self.dice  = value
        self.phase = 1

        colour = cur["colour"]
        self._log(f"🎲 {cur['name']} tirou {value}")

        # Verificar se há peças movíveis
        movable = get_movable_tokens(cur, value)
        if not movable:
            self._log(f"↩️ {cur['name']} tirou {value} — sem jogadas, passa a vez")
            self._next_turn(rolled_six=(value == 6))
            return value, None

        # Se só uma peça pode mover, mover automaticamente
        if len(movable) == 1:
            self._do_move(cur, movable[0])

        return value, None

    # ──────────────────────────────────────────
    #  OBTER PEÇAS MOVÍVEIS
    # ──────────────────────────────────────────

    def get_movable(self, user_id):
        cur = self.get_current_player()
        if not cur or cur["user_id"] != user_id or self.phase != 1:
            return []
        return get_movable_tokens(cur, self.dice)

    # ──────────────────────────────────────────
    #  MOVER PEÇA
    # ──────────────────────────────────────────

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

        # Sair da base
        if token["is_locked"]:
            start = TOKEN_PATHS[colour][0]
            token["coordinates"] = start
            token["is_locked"]   = False
            self._log(f"🚀 {player['name']}: peça {piece_idx+1} saiu da base!")
        else:
            # Mover para a frente
            path    = TOKEN_PATHS[colour]
            cur_idx = next((i for i, c in enumerate(path) if coords_equal(c, token["coordinates"])), -1)
            if cur_idx == -1:
                return
            new_idx = cur_idx + dice
            if new_idx >= len(path):
                return  # não pode passar do fim
            new_coord = path[new_idx]
            token["coordinates"] = new_coord

            # Chegou a casa
            if coords_equal(new_coord, path[-1]):
                token["has_reached_home"] = True
                player["fin"] += 1
                self._log(f"🏠 {player['name']}: peça {piece_idx+1} chegou a casa!")
                # Verificar vitória
                if player["fin"] == 4:
                    self._end_game(player)
                    return
            else:
                self._log(f"♟️ {player['name']} moveu peça {piece_idx+1}")
                # Captura
                self._check_capture(player, new_coord)

        # Próxima fase
        rolled_six = (dice == LOGIC_CONFIG["UNLOCK_DICE_VALUE"])
        self._next_turn(rolled_six=rolled_six)

    def _check_capture(self, moving_player, coord):
        """Capturar peças inimigas na mesma coordenada (se não for casa segura)."""
        if is_coord_safe(coord):
            return
        for player in self.players:
            if player["user_id"] == moving_player["user_id"]:
                continue
            for token in player["tokens"]:
                if not token["is_locked"] and not token["has_reached_home"] and coords_equal(token["coordinates"], coord):
                    # Voltar para a base
                    locked_coords = TOKEN_LOCKED_COORDINATES[player["colour"]]
                    token["coordinates"] = locked_coords[token["id"]]
                    token["is_locked"]   = True
                    self._log(f"💀 {moving_player['name']} capturou peça de {player['name']}!")

    # ──────────────────────────────────────────
    #  TURNO SEGUINTE
    # ──────────────────────────────────────────

    def _next_turn(self, rolled_six=False):
        self.phase = 0
        self.dice  = 0

        if rolled_six:
            self.consecutive_sixes += 1
            # 3 seis seguidos: perde a vez
            if self.consecutive_sixes >= 3:
                self.consecutive_sixes = 0
                self._log(f"⚠️ Três seis seguidos — perde a vez!")
                self._advance_turn()
            else:
                # Joga de novo
                self._log(f"🎯 {self.get_current_player()['name']} joga novamente (tirou 6)!")
        else:
            self.consecutive_sixes = 0
            self._advance_turn()

    def _advance_turn(self):
        active = [p for p in self.players if p["fin"] < 4]
        if not active:
            return
        # Avançar para o próximo jogador que ainda está a jogar
        n = len(self.players)
        for _ in range(n):
            self.turn = (self.turn + 1) % n
            if self.players[self.turn]["fin"] < 4:
                break
        self.round += 1

    # ──────────────────────────────────────────
    #  FIM DE JOGO
    # ──────────────────────────────────────────

    def _end_game(self, winner_player):
        self.over   = True
        self.winner = winner_player["user_id"]
        self._log(f"🏆 {winner_player['name']} VENCEU a partida!")

    # ──────────────────────────────────────────
    #  LOG
    # ──────────────────────────────────────────

    def _log(self, msg):
        self.log.append(msg)
        if len(self.log) > 50:
            self.log = self.log[-50:]

    # ──────────────────────────────────────────
    #  BOT
    # ──────────────────────────────────────────

    def bot_turn(self, bot_user_id):
        """
        Executa a jogada do bot.
        Retorna o estado actualizado.
        """
        cur = self.get_current_player()
        if not cur or cur["user_id"] != bot_user_id:
            return None, "Não é o turno do bot."

        # Rolar dado
        dice, err = self.roll_dice(bot_user_id)
        if err:
            return None, err

        # Se ainda está na fase de mover (não avançou automaticamente)
        if self.phase == 1:
            all_tokens = [t for p in self.players for t in p["tokens"]]
            best_idx   = select_best_token_for_bot(cur["colour"], dice, self.players)
            if best_idx is not None:
                self._do_move(cur, best_idx)

        return self.state_dict(bot_user_id), None

    # ──────────────────────────────────────────
    #  ESTADO SERIALIZÁVEL
    # ──────────────────────────────────────────

    def state_dict(self, requesting_user_id=None):
        """Dicionário serializável para enviar via SSE/JSON."""
        players_out = []
        for p in self.players:
            tokens_out = []
            for t in p["tokens"]:
                tokens_out.append({
                    "id":              t["id"],
                    "colour":          t["colour"],
                    "x":               t["coordinates"][0],
                    "y":               t["coordinates"][1],
                    "is_locked":       t["is_locked"],
                    "has_reached_home": t["has_reached_home"],
                })
            players_out.append({
                "user_id": p["user_id"],
                "name":    p["name"],
                "colour":  p["colour"],
                "idx":     p["idx"],
                "fin":     p["fin"],
                "is_bot":  p["is_bot"],
                "tokens":  tokens_out,
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
        """Resumo para o lobby."""
        host = self.players[0] if self.players else {}
        return {
            "id":      self.room_id,
            "bet":     self.bet,
            "players": len(self.players),
            "max":     self.max_players,
            "host":    host.get("name", "?"),
            "started": self.started,
        }

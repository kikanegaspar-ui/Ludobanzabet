"""app.py — LudoKz Backend v9
CORREÇÕES:
1. _finish_game: atualiza saldo e envia balance correto via SSE
2. api_leave: idem para abandono
3. SSE: heartbeat robusto, reconnect automático
4. Bónus frontend: endpoints preservados e não interferem com wallet
5. credit_prize chamado uma única vez com valores corretos
"""
import json, queue, threading, os, secrets, time, uuid
from functools import wraps
from flask import (Flask, render_template, request, jsonify,
                   session, Response, stream_with_context)
import psycopg2
from psycopg2.extras import RealDictCursor
from database import *
from sms_service import formatar_numero_angola, enviar_sms_simulado, operadora
from game_manager import GameManager

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))
PLATFORM_EXPRESS = os.environ.get("PLATFORM_EXPRESS", "922 745 946")
ADMIN_KEY        = os.environ.get("ADMIN_KEY", "ludokz2025")

ROOM_TIMEOUT_SECS = 300
PLATFORM_FEE = 0.10

init_db()

@app.after_request
def add_godot_headers(response):
    response.headers["Cross-Origin-Opener-Policy"]   = "same-origin"
    response.headers["Cross-Origin-Embedder-Policy"] = "require-corp"
    return response

@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"]      = "*"
    response.headers["Access-Control-Allow-Credentials"] = "true"
    response.headers["Access-Control-Allow-Headers"]     = "Content-Type"
    response.headers["Access-Control-Allow-Methods"]     = "GET,POST,OPTIONS"
    return response

@app.route("/api/<path:path>", methods=["OPTIONS"])
def options_handler(path):
    return "", 204

def get_pg():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

_rooms: dict = {}
_rooms_lk = threading.Lock()

BET_TIERS = {1000: "Bronze", 5000: "Prata", 10000: "Ouro", 50000: "VIP"}

def _get_room(rid: str):
    return _rooms.get(rid)

def _make_rid() -> str:
    return str(uuid.uuid4())[:8].upper()

_sse: dict = {}
_sse_lk = threading.Lock()

_otp_rate: dict = {}
_otp_rate_lk = threading.Lock()

def _otp_permitido(phone: str, max_por_minuto: int = 2) -> bool:
    agora = time.time()
    with _otp_rate_lk:
        contagem, reset_em = _otp_rate.get(phone, (0, agora + 60))
        if agora > reset_em:
            contagem, reset_em = 0, agora + 60
        if contagem >= max_por_minuto:
            return False
        _otp_rate[phone] = (contagem + 1, reset_em)
        return True

def push(uid, event: str, data: dict):
    try:
        uid_key = int(uid)
    except (ValueError, TypeError):
        uid_key = uid
    msg = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
    with _sse_lk:
        for q in _sse.get(uid_key, []):
            try:
                if q.full():
                    try: q.get_nowait()
                    except: pass
                q.put_nowait(msg)
            except Exception:
                pass

def push_admin(event: str, data: dict):
    push(-1, event, data)

def push_room(rid: str, event: str, data: dict):
    r = _get_room(rid)
    if r:
        for p in r.players:
            push(p["user_id"], event, data)

def login_req(f):
    @wraps(f)
    def d(*a, **kw):
        if "uid" not in session:
            return jsonify({"error": "Não autenticado"}), 401
        return f(*a, **kw)
    return d

def admin_req(f):
    @wraps(f)
    def d(*a, **kw):
        if request.headers.get("X-Admin-Key", "") != ADMIN_KEY:
            return jsonify({"error": "Acesso negado"}), 403
        return f(*a, **kw)
    return d

def safe_user(u):
    if not u: return {}
    return {k: u.get(k, "") for k in
            ("id", "name", "phone", "balance", "express_number",
             "games_played", "wins", "losses", "total_earned",
             "phone_verified", "age_confirmed", "terms_accepted", "created_at",
             "welcome_bonus_claimed", "ten_games_bonus_claimed")}

# ══════════════════════════════════════════════════════════════
#  SISTEMA DE RESERVA TEMPORÁRIA
# ══════════════════════════════════════════════════════════════
_reservations: dict = {}
_res_lk = threading.Lock()

def _reserve(rid: str, uid: int, amount: float) -> bool:
    uid = int(uid)
    conn = get_pg(); cur = conn.cursor()
    cur.execute("SELECT balance FROM users WHERE id=%s", (uid,))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row or float(row["balance"]) < amount:
        return False
    with _res_lk:
        _reservations.setdefault(rid, {})[uid] = amount
    return True

def _collect_reservations(rid: str) -> bool:
    with _res_lk:
        res = dict(_reservations.get(rid, {}))
    for uid, amount in res.items():
        uid = int(uid)
        if uid < 0:
            continue
        if not deduct_bet(uid, amount):
            return False
        tier = BET_TIERS.get(amount, str(amount))
        add_tx(uid, "bet", -amount, f"Aposta sala {tier}")
    with _res_lk:
        _reservations.pop(rid, None)
    return True

def _release_reservation(rid: str, uid=None):
    with _res_lk:
        if uid is not None:
            uid = int(uid)
            _reservations.get(rid, {}).pop(uid, None)
        else:
            _reservations.pop(rid, None)

# ══════════════════════════════════════════════════════════════
#  LIMPAR SALAS PENDENTES DO UTILIZADOR
# ══════════════════════════════════════════════════════════════
def _remove_user_from_pending_rooms(uid):
    uid_str = str(uid)
    uid_int = int(uid)

    rids_to_clean = []
    with _rooms_lk:
        for rid, r in list(_rooms.items()):
            if r.started:
                continue
            if any(str(p["user_id"]) == uid_str for p in r.players):
                rids_to_clean.append(rid)

    for rid in rids_to_clean:
        _release_reservation(rid, uid_int)
        with _rooms_lk:
            r = _rooms.get(rid)
            if not r:
                continue
            r.players = [p for p in r.players if str(p["user_id"]) != uid_str]
            if not r.players:
                _rooms.pop(rid, None)
                _release_reservation(rid)


def _expire_room(rid: str):
    with _rooms_lk:
        r = _rooms.get(rid)
        if not r or r.started:
            return
        _rooms.pop(rid, None)
    _release_reservation(rid)
    if r:
        for p in r.players:
            u = get_user(int(p["user_id"]))
            push(p["user_id"], "balance_update", {
                "balance": float(u["balance"]) if u else 0,
                "msg": "⏰ A sala expirou por falta de jogadores. Reserva libertada."
            })

def _schedule_room_expire(rid: str):
    def _run():
        time.sleep(ROOM_TIMEOUT_SECS)
        _expire_room(rid)
    t = threading.Thread(target=_run, daemon=True)
    t.start()

# ══════════════════════════════════════════════════════════════
#  FINALIZAR JOGO — CORRIGIDO
# ══════════════════════════════════════════════════════════════
def _finish_game(rid: str):
    r = _get_room(rid)
    if not r or not r.over or not r.winner:
        return

    winner_id  = r.winner
    loser_ids  = [p["user_id"] for p in r.players if p["user_id"] != winner_id]
    n_players  = len(r.players)
    prize      = round(r.bet * n_players * (1 - PLATFORM_FEE), 2)

    # CORREÇÃO: credit_prize credita o saldo do vencedor na BD
    credit_prize(int(winner_id), [int(l) for l in loser_ids], r.bet, prize, r.round, rid)
    add_tx(int(winner_id), "prize", prize, f"Prémio vitória Ludo — sala {rid}")

    # CORREÇÃO: buscar saldo DEPOIS de credit_prize para ter valor actualizado
    wu = get_user(int(winner_id))
    winner_balance = float(wu["balance"]) if wu else 0

    push(winner_id, "game_over", {
        "won":      True,
        "prize":    prize,
        "balance":  winner_balance,
        "winner_id": winner_id,
    })

    for lid in loser_ids:
        lu = get_user(int(lid))
        loser_balance = float(lu["balance"]) if lu else 0
        push(lid, "game_over", {
            "won":      False,
            "prize":    0,
            "balance":  loser_balance,
            "winner_id": winner_id,
        })

    with _rooms_lk:
        _rooms.pop(rid, None)

# ══════════════════════════════════════════════════════════════
#  ABANDONAR JOGO — CORRIGIDO
# ══════════════════════════════════════════════════════════════
@app.route("/api/game/leave", methods=["POST"])
@login_req
def api_leave():
    rid = (request.json or {}).get("room_id", "")
    uid = session["uid"]
    uid_str = str(uid)
    r = _get_room(rid)
    if not r:
        return jsonify({"ok": True})

    if not r.started:
        _release_reservation(rid, uid)
        with _rooms_lk:
            if rid in _rooms:
                _rooms[rid].players = [p for p in r.players if str(p["user_id"]) != uid_str]
                if not _rooms[rid].players:
                    _rooms.pop(rid, None)
                    _release_reservation(rid)
        return jsonify({"ok": True, "msg": "Saíste da sala. Reserva libertada."})

    if r.over:
        with _rooms_lk:
            _rooms.pop(rid, None)
        return jsonify({"ok": True})

    remaining = [p for p in r.players if str(p["user_id"]) != uid_str]

    if remaining:
        r.over   = True
        r.winner = remaining[0]["user_id"]
        n_players = len(r.players)
        prize = round(r.bet * n_players * (1 - PLATFORM_FEE), 2)
        winner_id = r.winner
        loser_ids = [p["user_id"] for p in r.players if p["user_id"] != winner_id]

        credit_prize(int(winner_id), [int(l) for l in loser_ids], r.bet, prize, r.round, rid)
        add_tx(int(winner_id), "prize", prize, f"Prémio — adversário abandonou sala {rid}")

        # CORREÇÃO: saldo actualizado após credit_prize
        wu = get_user(int(winner_id))
        winner_balance = float(wu["balance"]) if wu else 0
        push(winner_id, "game_over", {
            "won":      True,
            "prize":    prize,
            "balance":  winner_balance,
            "winner_id": winner_id,
        })

        lu = get_user(uid)
        loser_balance = float(lu["balance"]) if lu else 0
        push(uid_str, "game_over", {
            "won":      False,
            "prize":    0,
            "balance":  loser_balance,
            "winner_id": winner_id,
        })

        with _rooms_lk:
            _rooms.pop(rid, None)
    else:
        r.over = True
        with _rooms_lk:
            _rooms.pop(rid, None)

    return jsonify({"ok": True})

# ══════════════════════════════════════════════════════════════

@app.route("/")
def index():
    return render_template("index.html", platform_express=PLATFORM_EXPRESS)

@app.route("/admin")
def admin_page():
    return render_template("admin.html")

@app.route("/api/otp/send", methods=["POST"])
def api_otp_send():
    d = request.json or {}
    raw_phone = d.get("phone", "").strip()
    purpose   = d.get("purpose", "register")
    name      = d.get("name", "utilizador")
    phone, err = formatar_numero_angola(raw_phone)
    if err: return jsonify({"error": err}), 400
    if not _otp_permitido(phone):
        return jsonify({"error": "Demasiados pedidos. Aguarda 1 minuto."}), 429
    if purpose == "register" and get_user_by_phone(phone):
        return jsonify({"error": "Número já registado. Faz login."}), 400
    if purpose == "login" and not get_user_by_phone(phone):
        return jsonify({"error": "Número não encontrado. Regista-te primeiro."}), 404
    code = criar_otp(phone, purpose)
    ok, msg = enviar_sms_simulado(phone, code, name)
    if not ok: return jsonify({"error": "Falha ao enviar SMS. Tenta novamente."}), 500
    op = operadora(phone)
    return jsonify({"ok": True, "phone": phone, "operadora": op,
                    "msg": f"Código enviado para {phone} ({op}). Válido por 2 minutos."})

@app.route("/api/otp/verify", methods=["POST"])
def api_otp_verify():
    d       = request.json or {}
    phone   = d.get("phone", "").strip()
    code    = d.get("code", "").strip()
    purpose = d.get("purpose", "register")
    ok, msg = verificar_otp(phone, code, purpose)
    if not ok: return jsonify({"error": msg}), 400
    session[f"otp_ok_{purpose}"] = phone
    return jsonify({"ok": True, "verified": True})

@app.route("/api/register", methods=["POST"])
def api_register():
    d        = request.json or {}
    name     = d.get("name", "").strip()
    phone    = d.get("phone", "").strip()
    pw       = d.get("password", "")
    age_ok   = d.get("age_confirmed", False)
    terms_ok = d.get("terms_accepted", False)
    ref_code = d.get("ref_code", "").strip()
    if not name or not phone or not pw:
        return jsonify({"error": "Preencha todos os campos."}), 400
    if len(pw) < 6:
        return jsonify({"error": "Senha mínima 6 caracteres."}), 400
    if not age_ok:
        return jsonify({"error": "Deves confirmar que tens 18 ou mais anos."}), 400
    if not terms_ok:
        return jsonify({"error": "Deves aceitar os Termos e Condições."}), 400
    otp_sessao   = session.get("otp_ok_register") == phone
    otp_frontend = bool(d.get("phone_verified") or d.get("otp"))
    if not otp_sessao and not otp_frontend:
        return jsonify({"error": "Verifica o número por SMS antes de te registares."}), 400
    try:
        uid = create_user(phone, pw, name, age_ok, terms_ok, ref_code)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    marcar_telefone_verificado(phone)
    session.pop("otp_ok_register", None)
    session["uid"] = uid
    return jsonify({"ok": True, "user": safe_user(get_user(uid))})

@app.route("/api/login", methods=["POST"])
def api_login():
    d  = request.json or {}
    ph = d.get("phone", "").strip()
    pw = d.get("password", "")
    u  = verify_user(ph, pw)
    if not u: return jsonify({"error": "Número ou senha incorretos."}), 401
    session["uid"] = u["id"]
    return jsonify({"ok": True, "user": safe_user(u)})

@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear()
    return jsonify({"ok": True})

@app.route("/api/me")
@login_req
def api_me():
    return jsonify({"user": safe_user(get_user(session["uid"]))})

@app.route("/api/reset/request", methods=["POST"])
def api_reset_req():
    phone = (request.json or {}).get("phone", "").strip()
    u = get_user_by_phone(phone)
    if not u:
        return jsonify({"ok": True, "msg": "Se o número existir, receberás um SMS."})
    name = u.get("name", "utilizador")
    code = criar_otp(phone, "reset")
    ok, msg = enviar_sms_simulado(phone, code, name)
    if not ok:
        return jsonify({"error": "Falha ao enviar SMS. Tenta novamente."}), 500
    push_admin("password_reset", {"phone": phone, "code": code, "name": name})
    return jsonify({"ok": True, "msg": f"Código SMS enviado para {phone}."})

@app.route("/api/reset/confirm", methods=["POST"])
def api_reset_confirm():
    d      = request.json or {}
    phone  = d.get("phone", "").strip()
    code   = d.get("code", "").strip()
    new_pw = d.get("password", "")
    if len(new_pw) < 6: return jsonify({"error": "Senha mínima 6 caracteres."}), 400
    ok, msg = verificar_otp(phone, code, "reset")
    if not ok: return jsonify({"error": msg}), 400
    u = get_user_by_phone(phone)
    if not u: return jsonify({"error": "Número não encontrado."}), 404
    reset_password(u["id"], new_pw)
    return jsonify({"ok": True})

@app.route("/api/set_express", methods=["POST"])
@login_req
def api_set_express():
    num = (request.json or {}).get("number", "").strip()
    if not num: return jsonify({"error": "Número inválido."}), 400
    set_express(session["uid"], num)
    return jsonify({"ok": True})

@app.route("/api/deposit/request", methods=["POST"])
@login_req
def api_dep_req():
    d = request.json or {}
    try:   amt = float(d.get("amount", 0))
    except: return jsonify({"error": "Valor inválido."}), 400
    ref   = d.get("express_ref", "").strip()
    payer = d.get("payer_name", "").strip()
    if amt < 500:    return jsonify({"error": "Mínimo 500 Kz."}), 400
    if amt > 100000: return jsonify({"error": "Máximo 100.000 Kz por dia."}), 400
    if not ref:      return jsonify({"error": "Insere a referência Express."}), 400
    did  = create_deposit(session["uid"], amt, ref, payer)
    deps = get_pending_deposits()
    push_admin("new_deposit", {"deposit_id": did, "amount": amt, "ref": ref,
                               "payer": payer, "pending_count": len(deps)})
    return jsonify({"ok": True, "deposit_id": did})

@app.route("/api/deposit/list")
@login_req
def api_dep_list():
    return jsonify({"deposits": get_user_deposits(session["uid"])})

@app.route("/api/withdraw/request", methods=["POST"])
@login_req
def api_wit_req():
    d = request.json or {}
    try:   amt = float(d.get("amount", 0))
    except: return jsonify({"error": "Valor inválido."}), 400
    num  = d.get("express_number", "").strip()
    name = d.get("account_name", "").strip()
    if not num:
        u   = get_user(session["uid"])
        num = u.get("express_number", "") or ""
    if not num:      return jsonify({"error": "Insere o teu número Express Card."}), 400
    if not name:     return jsonify({"error": "Insere o nome da conta Express."}), 400
    if amt < 1000:   return jsonify({"error": "Mínimo 1.000 Kz."}), 400
    if amt > 50000:  return jsonify({"error": "Máximo 50.000 Kz por dia."}), 400
    wid, err = create_withdrawal(session["uid"], amt, num, name)
    if err: return jsonify({"error": err}), 400
    net = round(amt * 0.90, 2)
    push_admin("new_withdrawal", {"wid": wid, "amount": amt, "net": net,
                                   "express": num, "account_name": name})
    return jsonify({"ok": True, "wid": wid, "net": net,
                    "msg": f"Pedido enviado. Receberás {net:,.0f} Kz em {num}"})

@app.route("/api/withdraw/list")
@login_req
def api_wit_list():
    return jsonify({"withdrawals": get_user_withdrawals(session["uid"])})

@app.route("/api/transactions")
@login_req
def api_txs():
    return jsonify({"transactions": get_transactions(session["uid"])})

@app.route("/api/games/history")
@login_req
def api_ghist():
    return jsonify({"games": get_user_games(session["uid"])})

# ══════════════════════════════════════════════════════════════
#  LOBBY
# ══════════════════════════════════════════════════════════════
@app.route("/api/lobby")
@login_req
def api_lobby():
    with _rooms_lk:
        lobby = [
            r.lobby_dict() for r in _rooms.values()
            if not r.started and r.player_count() < r.max_players
        ]
    return jsonify({"rooms": lobby})

# ══════════════════════════════════════════════════════════════
#  CRIAR SALA
# ══════════════════════════════════════════════════════════════
@app.route("/api/room/create", methods=["POST"])
@login_req
def api_create():
    d = request.json or {}
    try:   bet = float(d.get("bet", 0))
    except: return jsonify({"error": "Aposta inválida."}), 400
    max_p = int(d.get("max_players", 2))
    if bet not in BET_TIERS:   return jsonify({"error": "Valor inválido."}), 400
    if max_p not in [2, 3, 4]: return jsonify({"error": "Número de jogadores inválido."}), 400

    uid = session["uid"]
    u = get_user(uid)

    _remove_user_from_pending_rooms(uid)

    if u["balance"] < bet:
        return jsonify({"error": "Saldo insuficiente."}), 400

    rid  = _make_rid()
    room = GameManager(rid, bet, max_p, uid, u["name"])

    if not _reserve(rid, uid, bet):
        return jsonify({"error": "Saldo insuficiente."}), 400

    with _rooms_lk:
        _rooms[rid] = room

    _schedule_room_expire(rid)

    return jsonify({"ok": True, "room_id": rid,
                    "msg": "Sala criada! Saldo reservado. Tens 5 minutos."})

# ══════════════════════════════════════════════════════════════
#  ENTRAR NA SALA
# ══════════════════════════════════════════════════════════════
@app.route("/api/room/join", methods=["POST"])
@login_req
def api_join():
    d   = request.json or {}
    rid = d.get("room_id", "").strip()
    uid = session["uid"]
    uid_str = str(uid)

    _remove_user_from_pending_rooms(uid)

    with _rooms_lk:
        r = _rooms.get(rid)
        if not r:
            return jsonify({"error": "Sala não encontrada."}), 404
        if r.started:
            return jsonify({"error": "O jogo já começou."}), 400
        if r.player_count() >= r.max_players:
            return jsonify({"error": "Sala cheia."}), 400

        if any(str(p["user_id"]) == uid_str for p in r.players):
            return jsonify({"ok": True, "room_id": rid, "state": r.state_dict(uid_str)})

        u = get_user(uid)
        if u["balance"] < r.bet:
            return jsonify({"error": "Saldo insuficiente."}), 400

        if not _reserve(rid, uid, r.bet):
            return jsonify({"error": "Saldo insuficiente."}), 400

        ok, err = r.add_player(uid, u["name"])
        if not ok:
            _release_reservation(rid, uid)
            return jsonify({"error": err}), 400

    push_room(rid, "player_joined", {
        "name":    u["name"],
        "players": r.player_count(),
        "max":     r.max_players,
    })

    if r.player_count() >= r.max_players:
        ok2 = _collect_reservations(rid)
        if not ok2:
            _release_reservation(rid)
            with _rooms_lk:
                _rooms.pop(rid, None)
            return jsonify({"error": "Erro ao processar apostas. Tenta novamente."}), 400

        ok3, _ = r.start()
        if ok3:
            state = r.state_dict()
            push_room(rid, "game_started", state)

    return jsonify({"ok": True, "room_id": rid, "state": r.state_dict(uid_str)})

@app.route("/api/room/start", methods=["POST"])
@login_req
def api_start():
    rid = (request.json or {}).get("room_id", "")
    r   = _get_room(rid)
    if not r: return jsonify({"error": "Sala não encontrada."}), 404
    if str(r.players[0]["user_id"]) != str(session["uid"]):
        return jsonify({"error": "Só o criador pode iniciar."}), 403
    ok2 = _collect_reservations(rid)
    if not ok2:
        return jsonify({"error": "Erro ao processar apostas."}), 400
    ok, err = r.start()
    if not ok: return jsonify({"error": err}), 400
    state = r.state_dict()
    push_room(rid, "game_started", state)
    return jsonify({"ok": True, "state": r.state_dict(str(session["uid"]))})

@app.route("/api/room/<rid>/state")
@login_req
def api_state(rid):
    r = _get_room(rid)
    if not r: return jsonify({"error": "Sala não encontrada."}), 404
    return jsonify(r.state_dict(str(session["uid"])))

@app.route("/api/game/roll", methods=["POST"])
@login_req
def api_roll():
    rid = (request.json or {}).get("room_id", "").strip()
    if not rid: return jsonify({"error": "ID inválido."}), 400
    r = _get_room(rid)
    if not r: return jsonify({"error": "Sala não encontrada."}), 404
    dice, err = r.roll_dice(str(session["uid"]))
    if err: return jsonify({"error": err}), 400
    state = r.state_dict(str(session["uid"]))
    push_room(rid, "game_update", state)
    if r.over:
        _finish_game(rid)
    return jsonify({**state, "dice": dice})

@app.route("/api/game/move", methods=["POST"])
@login_req
def api_move():
    d   = request.json or {}
    rid = d.get("room_id", "").strip()
    try:   piece = int(d.get("piece", 0))
    except: return jsonify({"error": "Peça inválida."}), 400
    r = _get_room(rid)
    if not r: return jsonify({"error": "Sala não encontrada."}), 404
    state, err = r.move_piece(str(session["uid"]), piece)
    if err: return jsonify({"error": err}), 400
    push_room(rid, "game_update", state)
    if r.over:
        _finish_game(rid)
    return jsonify(state)

@app.route("/api/game/movable", methods=["POST"])
@login_req
def api_movable():
    rid = (request.json or {}).get("room_id", "").strip()
    if not rid: return jsonify({"movable": []})
    r = _get_room(rid)
    if not r: return jsonify({"movable": []})
    return jsonify({"movable": r.get_movable(str(session["uid"])),
                    "dice": r.dice})

@app.route("/api/game/chat", methods=["POST"])
@login_req
def api_chat():
    d   = request.json or {}
    rid = d.get("room_id", "")
    msg = d.get("message", "").strip()[:120]
    if not msg or not rid: return jsonify({"ok": False}), 400
    r = _get_room(rid)
    if not r: return jsonify({"error": "Sala não encontrada."}), 404
    uid_str = str(session["uid"])
    if not any(str(p["user_id"]) == uid_str for p in r.players):
        return jsonify({"error": "Não estás nesta sala."}), 403
    u = get_user(session["uid"])
    push_room(rid, "chat_message", {"name": u["name"], "text": msg, "system": False})
    return jsonify({"ok": True})

# ══════════════════════════════════════════════════════════════
#  SSE — CORRIGIDO: heartbeat robusto, sem bloqueio
# ══════════════════════════════════════════════════════════════
@app.route("/api/events")
@login_req
def sse_user():
    uid = session["uid"]
    q = queue.Queue(maxsize=200)
    with _sse_lk:
        _sse.setdefault(uid, []).append(q)
    def gen():
        try:
            yield "event:connected\ndata:{\"ok\":true}\n\n"
            while True:
                try:
                    msg = q.get(timeout=15)
                    yield msg
                except queue.Empty:
                    # Heartbeat para manter ligação viva e detectar desconexões
                    yield ": heartbeat\n\n"
        finally:
            with _sse_lk:
                lst = _sse.get(uid, [])
                if q in lst: lst.remove(q)
    return Response(stream_with_context(gen()),
                    mimetype="text/event-stream",
                    headers={
                        "Cache-Control": "no-cache, no-store",
                        "X-Accel-Buffering": "no",
                        "Connection": "keep-alive",
                    })

@app.route("/api/admin/events")
def sse_admin():
    k = request.args.get("key", "") or request.headers.get("X-Admin-Key", "")
    if k != ADMIN_KEY:
        return jsonify({"error": "Acesso negado"}), 403
    q = queue.Queue(maxsize=200)
    with _sse_lk:
        _sse.setdefault(-1, []).append(q)
    def gen():
        try:
            yield "event:connected\ndata:{\"ok\":true}\n\n"
            while True:
                try:
                    msg = q.get(timeout=15)
                    yield msg
                except queue.Empty:
                    yield ": heartbeat\n\n"
        finally:
            with _sse_lk:
                lst = _sse.get(-1, [])
                if q in lst: lst.remove(q)
    return Response(stream_with_context(gen()),
                    mimetype="text/event-stream",
                    headers={
                        "Cache-Control": "no-cache, no-store",
                        "X-Accel-Buffering": "no",
                        "Connection": "keep-alive",
                    })

@app.route("/admin/deposits")
@admin_req
def adm_deps(): return jsonify({"deposits": get_pending_deposits()})

@app.route("/admin/deposits/<int:did>/approve", methods=["POST"])
@admin_req
def adm_approve(did):
    note   = (request.json or {}).get("note", "")
    ok     = approve_deposit(did, note)
    if ok:
        conn = get_pg(); cur = conn.cursor()
        cur.execute("SELECT * FROM deposits WHERE id=%s", (did,))
        dep = cur.fetchone(); cur.close(); conn.close()
        if dep:
            u = get_user(dep["user_id"])
            push(dep["user_id"], "deposit_approved", {
                "amount":  float(dep["amount"]),
                "balance": float(u["balance"]) if u else 0
            })
    return jsonify({"ok": ok})

@app.route("/admin/deposits/<int:did>/reject", methods=["POST"])
@admin_req
def adm_reject(did):
    reject_deposit(did, (request.json or {}).get("note", ""))
    return jsonify({"ok": True})

@app.route("/admin/withdrawals")
@admin_req
def adm_wits(): return jsonify({"withdrawals": get_pending_withdrawals()})

@app.route("/admin/withdrawals/<int:wid>/complete", methods=["POST"])
@admin_req
def adm_complete(wid):
    note = (request.json or {}).get("note", "")
    ok   = complete_withdrawal(wid, note)
    if ok:
        conn = get_pg(); cur = conn.cursor()
        cur.execute("SELECT * FROM withdrawals WHERE id=%s", (wid,))
        w = cur.fetchone(); cur.close(); conn.close()
        if w:
            push(w["user_id"], "withdrawal_done", {
                "amount":  float(w["amount"]),
                "net":     float(w["net_amount"]),
                "express": w["express_number"]
            })
    return jsonify({"ok": ok})

@app.route("/admin/withdrawals/<int:wid>/reject", methods=["POST"])
@admin_req
def adm_wit_reject(wid):
    ok = reject_withdrawal(wid, (request.json or {}).get("note", ""))
    if ok:
        conn = get_pg(); cur = conn.cursor()
        cur.execute("SELECT * FROM withdrawals WHERE id=%s", (wid,))
        w = cur.fetchone(); cur.close(); conn.close()
        if w:
            push(w["user_id"], "withdrawal_rejected", {
                "amount": float(w["amount"]),
                "msg":    "Levantamento rejeitado. Saldo devolvido à tua conta."
            })
    return jsonify({"ok": ok})

@app.route("/admin/notifications")
@admin_req
def adm_notifs():
    unread = request.args.get("unread", "0") == "1"
    return jsonify({"notifications": get_admin_notifs(unread_only=unread)})

@app.route("/admin/notifications/read", methods=["POST"])
@admin_req
def adm_read(): mark_notifs_read(); return jsonify({"ok": True})

@app.route("/admin/users")
@admin_req
def adm_users(): return jsonify({"users": get_all_users()})

@app.route("/admin/stats")
@admin_req
def adm_stats():
    conn = get_pg(); cur = conn.cursor()
    cur.execute("SELECT COUNT(*) AS n FROM users");              users = cur.fetchone()["n"]
    cur.execute("SELECT SUM(balance) AS s FROM users");          bal   = cur.fetchone()["s"] or 0
    cur.execute("SELECT COUNT(*) AS n, SUM(amount) AS s FROM deposits WHERE status='approved'");    deps  = cur.fetchone()
    cur.execute("SELECT COUNT(*) AS n, SUM(amount) AS s FROM withdrawals WHERE status='completed'"); wits  = cur.fetchone()
    cur.execute("SELECT COUNT(*) AS n FROM game_history");       games = cur.fetchone()["n"]
    cur.execute("SELECT COUNT(*) AS n FROM deposits WHERE status='pending'");    pdeps = cur.fetchone()["n"]
    cur.execute("SELECT COUNT(*) AS n FROM withdrawals WHERE status='pending'"); pwits = cur.fetchone()["n"]
    cur.close(); conn.close()
    return jsonify({"stats": {
        "users": users, "total_balance": float(bal),
        "deposits":    {"count": deps["n"], "total": float(deps["s"] or 0)},
        "withdrawals": {"count": wits["n"], "total": float(wits["s"] or 0)},
        "games": games,
        "pending_deposits":    pdeps,
        "pending_withdrawals": pwits,
    }})

@app.route("/admin/balance/add", methods=["POST"])
@admin_req
def adm_add_balance():
    d      = request.json or {}
    uid    = int(d.get("user_id", 0))
    amount = float(d.get("amount", 0))
    reason = d.get("reason", "Ajuste manual")
    if not uid or amount == 0: return jsonify({"error": "Dados inválidos"}), 400
    u_check = get_user(uid)
    if not u_check: return jsonify({"error": f"Utilizador {uid} não encontrado."}), 404
    conn = get_pg(); cur = conn.cursor()
    cur.execute("UPDATE users SET balance=balance+%s WHERE id=%s", (amount, uid))
    conn.commit(); cur.close(); conn.close()
    add_tx(uid, "admin_credit", amount, f"Admin: {reason}")
    u = get_user(uid)
    if u: push(uid, "balance_update", {"balance": float(u["balance"]),
                                        "msg": f"O teu saldo foi ajustado: +{amount:,.0f} Kz"})
    return jsonify({"ok": True})

@app.route("/api/admin/login", methods=["POST"])
@admin_req
def adm_login_as_player():
    d     = request.json or {}
    name  = d.get("name", "Admin").strip()
    ADMIN_PHONE = "admin@ludokz.internal"
    conn = get_pg(); cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE phone=%s", (ADMIN_PHONE,))
    u = cur.fetchone()
    if not u:
        cur.execute("INSERT INTO users(phone,password,name,balance) VALUES(%s,%s,%s,%s)",
                    (ADMIN_PHONE, "admin_no_login", name, 999999999))
        conn.commit()
        cur.execute("SELECT * FROM users WHERE phone=%s", (ADMIN_PHONE,))
        u = cur.fetchone()
    uid = u["id"]
    cur.execute("UPDATE users SET name=%s WHERE id=%s", (name, uid))
    conn.commit(); cur.close(); conn.close()
    session["uid"]      = uid
    session["is_admin"] = True
    return jsonify({"ok": True, "user": {"id": uid, "name": name, "balance": 999999999,
                                          "phone": ADMIN_PHONE, "games_played": 0,
                                          "wins": 0, "losses": 0, "total_earned": 0,
                                          "express_number": ""}})

@app.route("/api/admin/play/create", methods=["POST"])
@admin_req
def adm_play_create():
    d     = request.json or {}
    name  = d.get("name", "Admin").strip()
    max_p = int(d.get("max_players", 2))
    rid   = _make_rid()
    room  = GameManager(rid, 0, max_p, -999, name)
    with _rooms_lk:
        _rooms[rid] = room
    return jsonify({"ok": True, "room_id": rid})

@app.route("/api/admin/play/join", methods=["POST"])
@admin_req
def adm_play_join():
    d          = request.json or {}
    rid        = d.get("room_id", "")
    name       = d.get("name", "Jogador").strip()
    player_idx = int(d.get("player_idx", 1))
    r = _get_room(rid)
    if not r: return jsonify({"error": "Sala não encontrada."}), 404
    if r.player_count() >= r.max_players:
        return jsonify({"error": f"Sala cheia ({r.player_count()}/{r.max_players})."}), 400
    if r.started:
        return jsonify({"error": "O jogo já começou."}), 400
    ok, err = r.add_player(-(1000 + player_idx), name)
    if not ok: return jsonify({"error": err}), 400
    return jsonify({"ok": True, "players": r.player_count(), "max": r.max_players})

@app.route("/api/admin/play/start", methods=["POST"])
@admin_req
def adm_play_start():
    rid = (request.json or {}).get("room_id", "")
    r   = _get_room(rid)
    if not r: return jsonify({"error": "Sala não encontrada."}), 404
    ok, err = r.start()
    if not ok: return jsonify({"error": err}), 400
    state = r.state_dict()
    push_room(rid, "game_started", state)
    return jsonify({"ok": True, "state": state})

@app.route("/api/admin/play/roll", methods=["POST"])
@admin_req
def adm_play_roll():
    d   = request.json or {}
    rid = d.get("room_id", "")
    uid = int(d.get("uid", -999))
    r   = _get_room(rid)
    if not r: return jsonify({"error": "Sala não encontrada."}), 404
    dice, err = r.roll_dice(str(uid))
    if err: return jsonify({"error": err}), 400
    state = r.state_dict()
    push_room(rid, "game_update", state)
    return jsonify({**state, "dice": dice})

@app.route("/api/admin/play/move", methods=["POST"])
@admin_req
def adm_play_move():
    d     = request.json or {}
    rid   = d.get("room_id", "")
    uid   = int(d.get("uid", -999))
    piece = int(d.get("piece", 0))
    r     = _get_room(rid)
    if not r: return jsonify({"error": "Sala não encontrada."}), 404
    state, err = r.move_piece(str(uid), piece)
    if err: return jsonify({"error": err}), 400
    push_room(rid, "game_update", state)
    return jsonify(state)

@app.route("/api/admin/play/movable", methods=["POST"])
@admin_req
def adm_play_movable():
    d   = request.json or {}
    rid = d.get("room_id", "")
    uid = int(d.get("uid", -999))
    r   = _get_room(rid)
    if not r: return jsonify({"movable": []})
    return jsonify({"movable": r.get_movable(str(uid)), "dice": r.dice})

@app.route("/api/admin/play/state/<rid>")
@admin_req
def adm_play_state(rid):
    r = _get_room(rid)
    if not r: return jsonify({"error": "Sala não encontrada."}), 404
    return jsonify(r.state_dict())

@app.route("/api/admin/play/bot_turn", methods=["POST"])
@admin_req
def adm_bot_turn():
    d   = request.json or {}
    rid = d.get("room_id", "")
    uid = int(d.get("uid", -1000))
    r   = _get_room(rid)
    if not r: return jsonify({"error": "Sala não encontrada."}), 404
    def run():
        state, err = r.bot_turn(str(uid))
        if state:
            push_room(rid, "game_update", state)
            if r.over:
                _finish_game(rid)
    threading.Thread(target=run, daemon=True).start()
    return jsonify({"ok": True})

@app.route("/admin/promos", methods=["GET"])
@admin_req
def adm_promos(): return jsonify({"promos": get_all_promos()})

@app.route("/admin/promos/create", methods=["POST"])
@admin_req
def adm_promo_create():
    d        = request.json or {}
    code     = d.get("code", "").strip().upper()
    amount   = float(d.get("amount", 0))
    max_uses = int(d.get("max_uses", 100))
    expires  = d.get("expires", "")
    if not code or amount <= 0: return jsonify({"error": "Dados inválidos"}), 400
    create_promo(code, amount, max_uses, expires)
    return jsonify({"ok": True})

@app.route("/admin/promos/<code>/deactivate", methods=["POST"])
@admin_req
def adm_promo_deactivate(code):
    conn = get_pg(); cur = conn.cursor()
    cur.execute("UPDATE promo_codes SET active=0 WHERE code=%s", (code,))
    conn.commit(); cur.close(); conn.close()
    return jsonify({"ok": True})

@app.route("/admin/tickets")
@admin_req
def adm_tickets(): return jsonify({"tickets": get_all_tickets()})

@app.route("/admin/tickets/<int:tid>/reply", methods=["POST"])
@admin_req
def adm_ticket_reply(tid):
    reply = (request.json or {}).get("reply", "").strip()
    if not reply: return jsonify({"error": "Insere a resposta."}), 400
    ticket = reply_ticket(tid, reply)
    if ticket:
        push(ticket["user_id"], "support_reply", {
            "ticket_id": tid, "reply": reply,
            "msg": f"O suporte respondeu ao teu pedido: {reply[:80]}"
        })
    return jsonify({"ok": True})

@app.route("/api/referral/code")
@login_req
def api_ref_code():
    u = get_user(session["uid"])
    code = u.get("referral_code", "")
    if not code:
        code = set_referral_code(session["uid"])
    return jsonify({"code": code, "link": request.host_url + "?ref=" + code})

@app.route("/api/referral/list")
@login_req
def api_ref_list():
    return jsonify({"referrals": get_referrals(session["uid"])})

@app.route("/api/promo/use", methods=["POST"])
@login_req
def api_promo_use():
    code = (request.json or {}).get("code", "").strip()
    if not code: return jsonify({"error": "Insere o código."}), 400
    ok, result = use_promo(session["uid"], code)
    if not ok: return jsonify({"error": result}), 400
    u = get_user(session["uid"])
    push(session["uid"], "balance_update", {"balance": float(u["balance"])})
    return jsonify({"ok": True, "amount": result,
                    "msg": f"Bónus de {fmt_kz(result)} Kz aplicado!"})

def fmt_kz(n):
    try:    return f"{float(n):,.0f}".replace(",", ".")
    except: return "0"

@app.route("/api/bonus/daily/status")
@login_req
def api_daily_status():
    return jsonify(get_daily_status(session["uid"]))

@app.route("/api/bonus/daily/claim", methods=["POST"])
@login_req
def api_daily_claim():
    ok, result = claim_daily(session["uid"])
    if not ok: return jsonify({"error": result}), 400
    u = get_user(session["uid"])
    push(session["uid"], "balance_update", {"balance": float(u["balance"])})
    add_tx(session["uid"], "daily_bonus", result["amount"],
           f"Bónus diário dia {result['streak']}")
    return jsonify({"ok": True, **result, "balance": float(u["balance"])})

@app.route("/api/support/ticket", methods=["POST"])
@login_req
def api_support_send():
    msg = (request.json or {}).get("message", "").strip()
    if not msg or len(msg) < 5: return jsonify({"error": "Mensagem muito curta."}), 400
    tid = create_ticket(session["uid"], msg)
    push_admin("support_ticket", {
        "tid": tid, "uid": session["uid"],
        "name": get_user(session["uid"])["name"], "message": msg
    })
    return jsonify({"ok": True, "ticket_id": tid})

@app.route("/api/support/tickets")
@login_req
def api_support_list():
    return jsonify({"tickets": get_user_tickets(session["uid"])})

@app.route("/api/leaderboard")
def api_leaderboard():
    conn = get_pg(); cur = conn.cursor()
    cur.execute("""
        SELECT name, wins, games_played, total_earned,
               CASE WHEN games_played>0 THEN ROUND(wins*100.0/games_played,1) ELSE 0 END AS win_rate
        FROM users WHERE games_played > 0
        ORDER BY wins DESC, total_earned DESC LIMIT 10
    """)
    rows = cur.fetchall(); cur.close(); conn.close()
    return jsonify({"leaderboard": [dict(r) for r in rows]})

@app.route("/api/stats/public")
def api_stats_public():
    conn = get_pg(); cur = conn.cursor()
    cur.execute("SELECT COUNT(*) AS n FROM users");          users = cur.fetchone()["n"]
    cur.execute("SELECT COUNT(*) AS n FROM game_history");   games = cur.fetchone()["n"]
    cur.execute("SELECT SUM(prize) AS s FROM game_history"); paid  = cur.fetchone()["s"] or 0
    cur.close(); conn.close()
    online = len([uid for uid, qs in _sse.items() if uid > 0 and qs])
    return jsonify({"users": users, "games": games, "paid": float(paid), "online": online})

def get_jackpot_value():
    try:
        conn = get_pg(); cur = conn.cursor()
        cur.execute("SELECT value FROM jackpot LIMIT 1")
        row = cur.fetchone(); cur.close(); conn.close()
        return float(row["value"]) if row else 245000.0
    except Exception:
        return 245000.0

@app.route("/api/jackpot")
def api_jackpot():
    return jsonify({"value": get_jackpot_value()})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print("=" * 52)
    print("  LudoKz — Servidor iniciado")
    print(f"  Express : {PLATFORM_EXPRESS}")
    print(f"  Admin   : {ADMIN_KEY}")
    print(f"  URL     : http://0.0.0.0:{port}")
    print("=" * 52)
    app.run(debug=False, host="0.0.0.0", port=port, threaded=True)

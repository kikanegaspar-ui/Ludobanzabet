"""app.py — LudoKz Backend completo"""
import json, queue, threading, os, secrets, string, time, uuid, random, ctypes
import sqlite3 as _sq
from datetime import datetime, timedelta
from functools import wraps
from flask import (Flask, render_template, request, jsonify,
                   session, Response, stream_with_context)
from database import *
from sms_service import formatar_numero_angola, enviar_sms_simulado, operadora
from game_manager import gm

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)

PLATFORM_EXPRESS = os.environ.get("PLATFORM_EXPRESS", "923 456 789")
ADMIN_KEY        = os.environ.get("ADMIN_KEY", "ludokz2025")

init_db()

# SSE
_sse: dict[int, list[queue.Queue]] = {}
_sse_lk = threading.Lock()

def push(uid: int, event: str, data: dict):
    msg = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
    with _sse_lk:
        for q in _sse.get(uid, []):
            try:
                if q.full():
                    try: q.get_nowait()  # descarta msg antiga
                    except: pass
                q.put_nowait(msg)
            except Exception:
                pass

def push_admin(event: str, data: dict):
    push(-1, event, data)  # -1 = admin

def push_room(rid: str, event: str, data: dict):
    r = gm.get_room(rid)
    if r:
        players_snapshot = list(r.players)  # snapshot to avoid race condition
        for p in players_snapshot:
            push(p.user_id, event, data)

def login_req(f):
    @wraps(f)
    def d(*a, **kw):
        if "uid" not in session: return jsonify({"error":"Não autenticado"}), 401
        return f(*a, **kw)
    return d

def admin_req(f):
    @wraps(f)
    def d(*a, **kw):
        if request.headers.get("X-Admin-Key","") != ADMIN_KEY:
            return jsonify({"error":"Acesso negado"}), 403
        return f(*a, **kw)
    return d

def safe_user(u):
    if not u: return {}
    return {k: u.get(k,"") for k in
            ("id","name","phone","balance","express_number",
             "games_played","wins","losses","total_earned",
             "phone_verified","age_confirmed","terms_accepted","created_at")}

@app.route("/")
def index():
    return render_template("index.html", platform_express=PLATFORM_EXPRESS)

@app.route("/admin")
def admin_page():
    return render_template("admin.html")

# AUTH
@app.route("/api/otp/send", methods=["POST"])
def api_otp_send():
    """Envia OTP por SMS para o número angolano"""
    d = request.json or {}
    raw_phone = d.get("phone","").strip()
    purpose = d.get("purpose","register")
    name = d.get("name","utilizador")
    
    phone, err = formatar_numero_angola(raw_phone)
    if err: return jsonify({"error": err}), 400
    
    # Se for registo, verificar se já existe
    if purpose == "register" and get_user_by_phone(phone):
        return jsonify({"error": "Número já registado. Faz login."}), 400
    
    # Se for login, verificar se existe
    if purpose == "login" and not get_user_by_phone(phone):
        return jsonify({"error": "Número não encontrado. Regista-te primeiro."}), 404
    
    code = criar_otp(phone, purpose)
    ok, msg = enviar_sms_simulado(phone, code, name)
    
    if not ok:
        return jsonify({"error": "Falha ao enviar SMS. Tenta novamente."}), 500
    
    op = operadora(phone)
    return jsonify({
        "ok": True,
        "phone": phone,
        "operadora": op,
        "msg": f"Código enviado para {phone} ({op}). Válido por 2 minutos."
    })

@app.route("/api/otp/verify", methods=["POST"])
def api_otp_verify():
    """Verifica o código OTP"""
    d = request.json or {}
    phone = d.get("phone","").strip()
    code = d.get("code","").strip()
    purpose = d.get("purpose","register")
    
    ok, msg = verificar_otp(phone, code, purpose)
    if not ok: return jsonify({"error": msg}), 400
    
    return jsonify({"ok": True, "verified": True})

@app.route("/api/register", methods=["POST"])
def api_register():
    d = request.json or {}
    name = d.get("name","").strip()
    phone = d.get("phone","").strip()
    pw = d.get("password","")
    otp = d.get("otp","").strip()
    age_ok = d.get("age_confirmed", False)
    terms_ok = d.get("terms_accepted", False)
    ref_code = d.get("ref_code","").strip()
    
    if not name or not phone or not pw:
        return jsonify({"error":"Preencha todos os campos."}), 400
    if len(pw) < 6:
        return jsonify({"error":"Senha mínima 6 caracteres."}), 400
    if not age_ok:
        return jsonify({"error":"Deves confirmar que tens 18 ou mais anos."}), 400
    if not terms_ok:
        return jsonify({"error":"Deves aceitar os Termos e Condições."}), 400
    # OTP já foi verificado no passo anterior (/api/otp/verify)
    # Apenas confirmar que o número passou pela verificação
    # (O frontend só chega aqui depois de verificar o OTP)
    if not otp and not d.get("phone_verified"):
        return jsonify({"error":"Verifica o número primeiro."}), 400
    
    try:
        uid = create_user(phone, pw, name, age_ok, terms_ok, ref_code)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    
    marcar_telefone_verificado(phone)
    session["uid"] = uid
    return jsonify({"ok":True,"user":safe_user(get_user(uid))})

@app.route("/api/login", methods=["POST"])
def api_login():
    d = request.json or {}
    phone = d.get("phone","").strip()
    pw = d.get("password","")
    u = verify_user(phone, pw)
    if not u: return jsonify({"error":"Número ou senha incorretos."}), 401
    session["uid"] = u["id"]
    return jsonify({"ok":True,"user":safe_user(u)})

@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.clear(); return jsonify({"ok":True})

@app.route("/api/me")
@login_req
def api_me():
    return jsonify({"user": safe_user(get_user(session["uid"]))})

# RECUPERAR SENHA
@app.route("/api/reset/request", methods=["POST"])
def api_reset_req():
    """Reset senha via SMS OTP"""
    phone = (request.json or {}).get("phone","").strip()
    u = get_user_by_phone(phone)
    if not u:
        return jsonify({"ok":True,"msg":"Se o número existir, receberás um SMS."})
    # Enviar OTP de reset
    code = criar_otp(phone, "reset")
    enviar_sms_simulado(phone, code, u["name"])
    push_admin("password_reset", {"phone": phone, "code": code, "name": u["name"]})
    return jsonify({"ok":True,"msg":f"Código SMS enviado para {phone}."})

@app.route("/api/reset/confirm", methods=["POST"])
def api_reset_confirm():
    d = request.json or {}
    phone = d.get("phone","").strip()
    code = d.get("code","").strip()
    new_pw = d.get("password","")
    if len(new_pw) < 6: return jsonify({"error":"Senha mínima 6 caracteres."}), 400
    ok, msg = verificar_otp(phone, code, "reset")
    if not ok: return jsonify({"error": msg}), 400
    u = get_user_by_phone(phone)
    if not u: return jsonify({"error":"Número não encontrado."}), 404
    reset_password(u["id"], new_pw)
    return jsonify({"ok":True})

# PERFIL
@app.route("/api/set_express", methods=["POST"])
@login_req
def api_set_express():
    num = (request.json or {}).get("number","").strip()
    if not num: return jsonify({"error":"Número inválido."}), 400
    set_express(session["uid"], num)
    return jsonify({"ok":True})

# DEPÓSITO
@app.route("/api/deposit/request", methods=["POST"])
@login_req
def api_dep_req():
    d = request.json or {}
    try: amt = float(d.get("amount",0))
    except: return jsonify({"error":"Valor inválido."}), 400
    ref = d.get("express_ref","").strip()
    payer = d.get("payer_name","").strip()
    if amt < 500: return jsonify({"error":"Mínimo 500 Kz."}), 400
    if not ref:   return jsonify({"error":"Insere a referência Express."}), 400
    did = create_deposit(session["uid"], amt, ref, payer)
    # Notificar admin via SSE
    deps = get_pending_deposits()
    push_admin("new_deposit", {
        "deposit_id": did, "amount": amt, "ref": ref,
        "payer": payer, "pending_count": len(deps)
    })
    return jsonify({"ok":True,"deposit_id":did})

@app.route("/api/deposit/list")
@login_req
def api_dep_list():
    return jsonify({"deposits": get_user_deposits(session["uid"])})

# LEVANTAMENTO
@app.route("/api/withdraw/request", methods=["POST"])
@login_req
def api_wit_req():
    d = request.json or {}
    try: amt = float(d.get("amount",0))
    except: return jsonify({"error":"Valor inválido."}), 400
    num  = d.get("express_number","").strip()
    name = d.get("account_name","").strip()
    if not num:
        u = get_user(session["uid"])
        num = u.get("express_number","") or ""
    if not num:  return jsonify({"error":"Insere o teu número Express Card."}), 400
    if not name: return jsonify({"error":"Insere o nome da conta Express (para verificação)."}), 400
    wid, err = create_withdrawal(session["uid"], amt, num, name)
    if err: return jsonify({"error":err}), 400
    net = round(amt*0.95,2)
    push_admin("new_withdrawal", {"wid":wid,"amount":amt,"net":net,"express":num,"account_name":name})
    return jsonify({"ok":True,"wid":wid,"net":net,
                    "msg":f"Pedido enviado. Receberás {net:,.0f} Kz em {num}"})

@app.route("/api/withdraw/list")
@login_req
def api_wit_list():
    return jsonify({"withdrawals": get_user_withdrawals(session["uid"])})

# HISTÓRICO
@app.route("/api/transactions")
@login_req
def api_txs():
    return jsonify({"transactions": get_transactions(session["uid"])})

@app.route("/api/games/history")
@login_req
def api_ghist():
    return jsonify({"games": get_user_games(session["uid"])})

# LOBBY
BET_TIERS = {1000:"Bronze",5000:"Prata",10000:"Ouro",50000:"VIP"}

@app.route("/api/lobby")
@login_req
def api_lobby():
    return jsonify({"rooms": gm.lobby()})

@app.route("/api/room/create", methods=["POST"])
@login_req
def api_create():
    d = request.json or {}
    try: bet = float(d.get("bet",0))
    except: return jsonify({"error":"Aposta inválida."}), 400
    max_p = int(d.get("max_players", 2))
    if bet not in BET_TIERS: return jsonify({"error":"Valor inválido."}), 400
    if max_p not in [2,3,4]: return jsonify({"error":"Número de jogadores inválido."}), 400
    u = get_user(session["uid"])
    if u["balance"] < bet: return jsonify({"error":"Saldo insuficiente."}), 400
    if not deduct_bet(session["uid"], bet): return jsonify({"error":"Erro ao descontar."}), 400
    add_tx(session["uid"],"bet",-bet,f"Aposta sala {BET_TIERS[bet]} ({max_p} jogadores)")
    rid = gm.create_room(session["uid"], u["name"], bet, BET_TIERS[bet], max_p)
    return jsonify({"ok":True,"room_id":rid})

@app.route("/api/room/join", methods=["POST"])
@login_req
def api_join():
    d = request.json or {}
    rid = d.get("room_id","").strip()
    r = gm.get_room(rid)
    if not r: return jsonify({"error":"Sala não encontrada."}), 404
    u = get_user(session["uid"])
    if u["balance"] < r.bet: return jsonify({"error":"Saldo insuficiente."}), 400
    if not deduct_bet(session["uid"], r.bet): return jsonify({"error":"Erro ao descontar."}), 400
    ok, msg = gm.join_room(rid, session["uid"], u["name"])
    if not ok:
        refund_bet(session["uid"], r.bet); return jsonify({"error":msg}), 400
    add_tx(session["uid"],"bet",-r.bet,f"Aposta sala {r.tier}")
    push_room(rid, "player_joined", {"name": u["name"], "players": len(r.players), "max": r.max_p})
    # Se sala ficou cheia, iniciar jogo
    if len(r.players) >= r.max_p:
        state = gm.start_game(rid)
        if state: push_room(rid, "game_started", state)
    return jsonify({"ok":True,"room_id":rid,"state":gm.get_state(rid)})

@app.route("/api/room/start", methods=["POST"])
@login_req
def api_start():
    """Host pode iniciar com menos jogadores (min 2)"""
    rid = (request.json or {}).get("room_id","")
    r = gm.get_room(rid)
    if not r: return jsonify({"error":"Sala não encontrada."}), 404
    if r.players[0].user_id != session["uid"]:
        return jsonify({"error":"Só o criador pode iniciar."}), 403
    if len(r.players) < 2: return jsonify({"error":"Mínimo 2 jogadores."}), 400
    state = gm.start_game(rid)
    if state: push_room(rid, "game_started", state)
    return jsonify({"ok":True,"state":state})

@app.route("/api/room/<rid>/state")
@login_req
def api_state(rid):
    s = gm.get_state(rid)
    if not s: return jsonify({"error":"Sala não encontrada."}), 404
    return jsonify(s)

# JOGO
@app.route("/api/game/roll", methods=["POST"])
@login_req
def api_roll():
    rid = (request.json or {}).get("room_id","").strip()
    if not rid: return jsonify({"error":"ID inválido."}),400
    res = gm.roll(rid, session["uid"])
    if res is None: return jsonify({"error":"Não é o teu turno."}), 400
    push_room(rid, "game_update", res)
    return jsonify(res)

@app.route("/api/game/move", methods=["POST"])
@login_req
def api_move():
    d = request.json or {}
    rid = d.get("room_id","").strip()
    try:
        piece = int(d.get("piece", 0))
    except (ValueError, TypeError):
        return jsonify({"error": "Peça inválida."}), 400
    res = gm.move(rid, session["uid"], piece)
    if res is None: return jsonify({"error":"Jogada inválida."}), 400
    push_room(rid, "game_update", res)
    if res.get("over"):
        _finish_game(rid)
    return jsonify(res)

@app.route("/api/game/movable", methods=["POST"])
@login_req
def api_movable():
    rid = (request.json or {}).get("room_id","").strip()
    if not rid: return jsonify({"movable":[]})
    return jsonify({"movable": gm.movable(rid, session["uid"])})

@app.route("/api/game/leave", methods=["POST"])
@login_req
def api_leave():
    rid = (request.json or {}).get("room_id","")
    uid = session["uid"]
    r = gm.get_room(rid)
    if not r: return jsonify({"ok":True})
    if not r.started:
        refund_bet(uid, r.bet)
        gm.remove_room(rid)
        return jsonify({"ok":True})
    if r.over: gm.remove_room(rid); return jsonify({"ok":True})
    # Encontrar vencedor (entre os que ficaram)
    remaining = [p for p in r.players if p.user_id != uid]
    if remaining:
        winner_uid = max(remaining, key=lambda p: getattr(p, 'fin', 0)).user_id
        r2 = gm.force_win(rid, winner_uid)
        if r2: _finish_game(rid)
    return jsonify({"ok":True})

def _finish_game(rid):
    r = gm.get_room(rid)
    if not r or not r.over or not r.winner_ids: return
    credit_prize(r.winner_ids[0], r.loser_ids, r.bet, r.prize, r.rounds, rid)
    add_tx(r.winner_ids[0], "prize", r.prize, "Prémio vitória Ludo")
    wu = get_user(r.winner_ids[0])
    push(r.winner_ids[0], "game_over", {
        "won":True, "prize":r.prize,
        "balance": wu["balance"] if wu else 0
    })
    for lid in r.loser_ids:
        lu = get_user(lid)
        push(lid, "game_over", {
            "won":False, "prize":0,
            "balance": lu["balance"] if lu else 0
        })
    gm.remove_room(rid)

# SSE
@app.route("/api/events")
@login_req
def sse():
    uid = session["uid"]
    q = queue.Queue(maxsize=200)
    with _sse_lk:
        _sse.setdefault(uid, []).append(q)
    def gen():
        try:
            yield "event:connected\ndata:{\"ok\":true}\n\n"
            while True:
                try: yield q.get(timeout=20)
                except queue.Empty: yield ": ping\n\n"
        finally:
            with _sse_lk:
                lst = _sse.get(uid, [])
                if q in lst: lst.remove(q)
    return Response(stream_with_context(gen()),
                    mimetype="text/event-stream",
                    headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

@app.route("/api/admin/events")
@admin_req
def sse_admin():
    q = queue.Queue(maxsize=200)
    with _sse_lk:
        _sse.setdefault(-1, []).append(q)
    def gen():
        try:
            yield "event:connected\ndata:{\"ok\":true}\n\n"
            while True:
                try: yield q.get(timeout=20)
                except queue.Empty: yield ": ping\n\n"
        finally:
            with _sse_lk:
                lst = _sse.get(-1, [])
                if q in lst: lst.remove(q)
    return Response(stream_with_context(gen()),
                    mimetype="text/event-stream",
                    headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

# ADMIN API
@app.route("/admin/deposits")
@admin_req
def adm_deps(): return jsonify({"deposits":get_pending_deposits()})

@app.route("/admin/deposits/<int:did>/approve", methods=["POST"])
@admin_req
def adm_approve(did):
    note = (request.json or {}).get("note","")
    ok = approve_deposit(did, note)
    if ok:
        c = _sq.connect(DB); c.row_factory=_sq.Row
        dep = c.execute("SELECT * FROM deposits WHERE id=?",(did,)).fetchone(); c.close()
        if dep:
            u = get_user(dep["user_id"])
            push(dep["user_id"], "deposit_approved", {
                "amount": dep["amount"],
                "balance": u["balance"] if u else 0
            })
    return jsonify({"ok":ok})

@app.route("/admin/deposits/<int:did>/reject", methods=["POST"])
@admin_req
def adm_reject(did):
    reject_deposit(did, (request.json or {}).get("note",""))
    return jsonify({"ok":True})

@app.route("/admin/withdrawals")
@admin_req
def adm_wits(): return jsonify({"withdrawals":get_pending_withdrawals()})

@app.route("/admin/withdrawals/<int:wid>/complete", methods=["POST"])
@admin_req
def adm_complete(wid):
    note = (request.json or {}).get("note","")
    ok = complete_withdrawal(wid, note)
    if ok:
        c = _sq.connect(DB); c.row_factory=_sq.Row
        w = c.execute("SELECT * FROM withdrawals WHERE id=?",(wid,)).fetchone(); c.close()
        if w:
            push(w["user_id"], "withdrawal_done", {
                "amount": w["amount"], "net": w["net_amount"],
                "express": w["express_number"]
            })
    return jsonify({"ok":ok})

@app.route("/admin/withdrawals/<int:wid>/reject", methods=["POST"])
@admin_req
def adm_wit_reject(wid):
    ok = reject_withdrawal(wid, (request.json or {}).get("note",""))
    if ok:
        c = _sq.connect(DB); c.row_factory=_sq.Row
        w = c.execute("SELECT * FROM withdrawals WHERE id=?",(wid,)).fetchone(); c.close()
        if w:
            push(w["user_id"], "withdrawal_rejected", {
                "amount": w["amount"],
                "msg": "Levantamento rejeitado. Saldo devolvido à tua conta."
            })
    return jsonify({"ok":ok})

@app.route("/admin/notifications")
@admin_req
def adm_notifs():
    unread = request.args.get("unread","0") == "1"
    return jsonify({"notifications": get_admin_notifs(unread_only=unread)})

@app.route("/admin/notifications/read", methods=["POST"])
@admin_req
def adm_read(): mark_notifs_read(); return jsonify({"ok":True})

@app.route("/admin/users")
@admin_req
def adm_users(): return jsonify({"users": get_all_users()})

@app.route("/admin/stats")
@admin_req
def adm_stats():
    c = _sq.connect(DB); c.row_factory=_sq.Row
    users  = c.execute("SELECT COUNT(*) n FROM users").fetchone()["n"]
    bal    = c.execute("SELECT SUM(balance) s FROM users").fetchone()["s"] or 0
    deps   = c.execute("SELECT COUNT(*) n, SUM(amount) s FROM deposits WHERE status='approved'").fetchone()
    wits   = c.execute("SELECT COUNT(*) n, SUM(amount) s FROM withdrawals WHERE status='completed'").fetchone()
    games  = c.execute("SELECT COUNT(*) n FROM game_history").fetchone()["n"]
    pdeps  = c.execute("SELECT COUNT(*) n FROM deposits WHERE status='pending'").fetchone()["n"]
    pwits  = c.execute("SELECT COUNT(*) n FROM withdrawals WHERE status='pending'").fetchone()["n"]
    c.close()
    return jsonify({"stats":{
        "users": users, "total_balance": bal,
        "deposits": {"count": deps["n"], "total": deps["s"] or 0},
        "withdrawals": {"count": wits["n"], "total": wits["s"] or 0},
        "games": games,
        "pending_deposits": pdeps,
        "pending_withdrawals": pwits
    }})


# ════════════════ REFERIDOS ════════════════

@app.route("/api/referral/code")
@login_req
def api_ref_code():
    u = get_user(session["uid"])
    code = u.get("referral_code","")
    if not code:
        code = set_referral_code(session["uid"])
        u = get_user(session["uid"])
    return jsonify({"code": code, "link": request.host_url + "?ref=" + code})

@app.route("/api/referral/list")
@login_req
def api_ref_list():
    return jsonify({"referrals": get_referrals(session["uid"])})

# ════════════════ PROMO CODES ════════════════

@app.route("/api/promo/use", methods=["POST"])
@login_req
def api_promo_use():
    code = (request.json or {}).get("code","").strip()
    if not code: return jsonify({"error":"Insere o código."}), 400
    ok, result = use_promo(session["uid"], code)
    if not ok: return jsonify({"error": result}), 400
    u = get_user(session["uid"])
    push(session["uid"], "balance_update", {"balance": u["balance"]})
    return jsonify({"ok":True, "amount": result, "msg": f"Bónus de {fmt_kz(result)} Kz aplicado!"})

def fmt_kz(n):
    try:
        return f"{float(n):,.0f}".replace(",",".")
    except (ValueError, TypeError):
        return "0"

# ════════════════ BÓNUS DIÁRIO ════════════════

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
    push(session["uid"], "balance_update", {"balance": u["balance"]})
    add_tx(session["uid"], "daily_bonus", result["amount"],
           f"Bónus diário dia {result['streak']}")
    return jsonify({"ok":True, **result, "balance": u["balance"]})

# ════════════════ SUPORTE ════════════════

@app.route("/api/support/ticket", methods=["POST"])
@login_req
def api_support_send():
    msg = (request.json or {}).get("message","").strip()
    if not msg or len(msg) < 5: return jsonify({"error":"Mensagem muito curta."}), 400
    tid = create_ticket(session["uid"], msg)
    push_admin("support_ticket", {
        "tid": tid, "uid": session["uid"],
        "name": get_user(session["uid"])["name"], "message": msg
    })
    return jsonify({"ok":True, "ticket_id": tid})

@app.route("/api/support/tickets")
@login_req
def api_support_list():
    return jsonify({"tickets": get_user_tickets(session["uid"])})

# ════════════════ ADMIN — PROMO / SUPORTE ════════════════

@app.route("/admin/promos", methods=["GET"])
@admin_req
def adm_promos(): return jsonify({"promos": get_all_promos()})

@app.route("/admin/promos/create", methods=["POST"])
@admin_req
def adm_promo_create():
    d = request.json or {}
    code = d.get("code","").strip().upper()
    amount = float(d.get("amount",0))
    max_uses = int(d.get("max_uses",100))
    expires = d.get("expires","")
    if not code or amount <= 0: return jsonify({"error":"Dados inválidos"}), 400
    create_promo(code, amount, max_uses, expires)
    return jsonify({"ok":True})

@app.route("/admin/promos/<code>/deactivate", methods=["POST"])
@admin_req
def adm_promo_deactivate(code):
    c = _sq.connect(DB); c.execute("UPDATE promo_codes SET active=0 WHERE code=?", (code,))
    c.commit(); c.close()
    return jsonify({"ok":True})

@app.route("/admin/tickets")
@admin_req
def adm_tickets(): return jsonify({"tickets": get_all_tickets()})

@app.route("/admin/tickets/<int:tid>/reply", methods=["POST"])
@admin_req
def adm_ticket_reply(tid):
    reply = (request.json or {}).get("reply","").strip()
    if not reply: return jsonify({"error":"Insere a resposta."}), 400
    ticket = reply_ticket(tid, reply)
    if ticket:
        push(ticket["user_id"], "support_reply", {
            "ticket_id": tid, "reply": reply,
            "msg": f"O suporte respondeu ao teu pedido: {reply[:80]}"
        })
    return jsonify({"ok":True})

@app.route("/admin/balance/add", methods=["POST"])
@admin_req
def adm_add_balance():
    """Admin pode adicionar saldo manualmente a qualquer utilizador"""
    d = request.json or {}
    uid = int(d.get("user_id",0))
    amount = float(d.get("amount",0))
    reason = d.get("reason","Ajuste manual")
    if not uid or amount == 0: return jsonify({"error":"Dados inválidos"}), 400
    # Verify user exists before updating
    u_check = get_user(uid)
    if not u_check: return jsonify({"error": f"Utilizador {uid} não encontrado."}), 404
    c = _sq.connect(DB); c.execute("UPDATE users SET balance=balance+? WHERE id=?",(amount,uid))
    c.commit(); c.close()
    add_tx(uid,"admin_credit",amount,f"Admin: {reason}")
    u = get_user(uid)
    if u: push(uid,"balance_update",{"balance":u["balance"],"msg":f"O teu saldo foi ajustado: +{amount:,.0f} Kz"})
    return jsonify({"ok":True})


# ════════════════ ADMIN — MODO JOGO SEM DINHEIRO ════════════════

@app.route("/api/admin/login", methods=["POST"])
@admin_req
def adm_login_as_player():
    """Admin entra como jogador regular (sem dinheiro)"""
    d = request.json or {}
    name = d.get("name", "Admin").strip()
    # Criar/usar conta especial de admin (identificada pelo phone interno)
    ADMIN_PHONE = "admin@ludokz.internal"
    c = _sq.connect(DB); c.row_factory = _sq.Row
    u = c.execute("SELECT * FROM users WHERE phone=?", (ADMIN_PHONE,)).fetchone()
    if not u:
        c.execute("INSERT INTO users(phone,password,name,balance) VALUES(?,?,?,?)",
                  (ADMIN_PHONE,"admin_no_login",name,999999999))
        c.commit()
        u = c.execute("SELECT * FROM users WHERE phone=?", (ADMIN_PHONE,)).fetchone()
    uid = u["id"]
    # Update name if changed
    c.execute("UPDATE users SET name=? WHERE id=?", (name, uid))
    c.commit(); c.close()
    session["uid"] = uid
    session["is_admin"] = True
    return jsonify({"ok": True, "user": {"id": uid, "name": name, "balance": 999999999,
                                          "phone": ADMIN_PHONE,
                                          "games_played": 0, "wins": 0, "losses": 0,
                                          "total_earned": 0, "express_number": ""}})

@app.route("/api/admin/play/create", methods=["POST"])
@admin_req
def adm_play_create():
    """Admin cria sala de teste sem dinheiro real"""
    d = request.json or {}
    name = d.get("name", "Admin").strip()
    max_p = int(d.get("max_players", 2))
    # Usar uid=-999 para o admin (não precisa de conta)
    rid = gm.create_room(-999, name, 0, "Admin", max_p)
    return jsonify({"ok": True, "room_id": rid})

@app.route("/api/admin/play/join", methods=["POST"])
@admin_req
def adm_play_join():
    """Admin entra numa sala como qualquer jogador"""
    d = request.json or {}
    rid = d.get("room_id", "")
    name = d.get("name", "Admin").strip()
    player_idx = int(d.get("player_idx", 1))  # qual bot/jogador simular
    ok, msg = gm.join_room(rid, -(1000 + player_idx), name)
    if not ok: return jsonify({"error": msg}), 400
    return jsonify({"ok": True})

@app.route("/api/admin/play/start", methods=["POST"])
@admin_req
def adm_play_start():
    rid = (request.json or {}).get("room_id", "")
    state = gm.start_game(rid)
    if not state: return jsonify({"error": "Não foi possível iniciar."}), 400
    push_room(rid, "game_started", state)
    return jsonify({"ok": True, "state": state})

@app.route("/api/admin/play/roll", methods=["POST"])
@admin_req
def adm_play_roll():
    d = request.json or {}
    rid = d.get("room_id", "")
    uid = int(d.get("uid", -999))
    res = gm.roll(rid, uid)
    if res is None: return jsonify({"error": "Não é o turno deste jogador."}), 400
    return jsonify(res)

@app.route("/api/admin/play/move", methods=["POST"])
@admin_req  
def adm_play_move():
    d = request.json or {}
    rid = d.get("room_id", "")
    uid = int(d.get("uid", -999))
    piece = int(d.get("piece", 0))
    res = gm.move(rid, uid, piece)
    if res is None: return jsonify({"error": "Jogada inválida."}), 400
    return jsonify(res)

@app.route("/api/admin/play/movable", methods=["POST"])
@admin_req
def adm_play_movable():
    d = request.json or {}
    rid = d.get("room_id", "")
    uid = int(d.get("uid", -999))
    return jsonify({"movable": gm.movable(rid, uid)})

@app.route("/api/admin/play/state/<rid>")
@admin_req
def adm_play_state(rid):
    s = gm.get_state(rid)
    if not s: return jsonify({"error": "Sala não encontrada."}), 404
    return jsonify(s)


@app.route("/api/admin/play/bot_turn", methods=["POST"])
@admin_req
def adm_bot_turn():
    """Executa turno do bot automaticamente"""
    d = request.json or {}
    rid = d.get("room_id","")
    uid = int(d.get("uid", -1000))
    def run():
        result = gm.bot_move(rid, uid)
        if result:
            push_room(rid, "game_update", result)
            if result.get("over"):
                _finish_game(rid)
    threading.Thread(target=run, daemon=True).start()
    return jsonify({"ok": True})

# ════════════════ CHAT ════════════════

@app.route("/api/game/chat", methods=["POST"])
@login_req
def api_chat():
    d     = request.json or {}
    rid   = d.get("room_id","")
    msg   = d.get("message","").strip()[:120]
    if not msg or not rid: return jsonify({"ok":False}), 400
    r = gm.get_room(rid)
    if not r: return jsonify({"error":"Sala nao encontrada."}), 404
    if not any(p.user_id == session["uid"] for p in r.players):
        return jsonify({"error":"Nao estas nesta sala."}), 403
    u = get_user(session["uid"])
    push_room(rid, "chat_message", {"name": u["name"], "text": msg, "system": False})
    return jsonify({"ok":True})

# ════════════════ LEADERBOARD ════════════════

@app.route("/api/leaderboard")
def api_leaderboard():
    c = _sq.connect(DB); c.row_factory = _sq.Row
    rows = c.execute("""
        SELECT name, wins, games_played, total_earned,
               CASE WHEN games_played>0 THEN ROUND(wins*100.0/games_played,1) ELSE 0 END AS win_rate
        FROM users WHERE games_played > 0
        ORDER BY wins DESC, total_earned DESC LIMIT 10
    """).fetchall()
    c.close()
    return jsonify({"leaderboard": [dict(r) for r in rows]})

# ════════════════ STATS PUBLICAS ════════════════

@app.route("/api/stats/public")
def api_stats_public():
    c = _sq.connect(DB); c.row_factory = _sq.Row
    users  = c.execute("SELECT COUNT(*) n FROM users").fetchone()["n"]
    games  = c.execute("SELECT COUNT(*) n FROM game_history").fetchone()["n"]
    paid   = c.execute("SELECT SUM(prize) s FROM game_history").fetchone()["s"] or 0
    online = len([uid for uid, qs in _sse.items() if uid > 0 and qs])
    c.close()
    return jsonify({"users": users, "games": games, "paid": paid, "online": online})

# ════════════════ JACKPOT PROGRESSIVO ════════════════
_jackpot_lock = threading.Lock()

def get_jackpot_value():
    """Lê jackpot da DB para persistir entre reinícios"""
    try:
        c = _sq.connect(DB); c.row_factory = _sq.Row
        row = c.execute("SELECT value FROM jackpot LIMIT 1").fetchone()
        c.close()
        return float(row["value"]) if row else 245000.0
    except Exception:
        return 245000.0

def grow_jackpot(bet):
    with _jackpot_lock:
        try:
            current = get_jackpot_value()
            new_val = round(current + float(bet) * 0.01, 2)
            c = _sq.connect(DB)
            c.execute("CREATE TABLE IF NOT EXISTS jackpot(id INTEGER PRIMARY KEY, value REAL)")
            c.execute("INSERT OR REPLACE INTO jackpot(id,value) VALUES(1,?)", (new_val,))
            c.commit(); c.close()
        except Exception:
            pass

@app.route("/api/jackpot")
def api_jackpot():
    return jsonify({"value": get_jackpot_value()})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print("="*52)
    print("  LudoKz — Servidor iniciado")
    print(f"  Express : {PLATFORM_EXPRESS}")
    print(f"  Admin   : {ADMIN_KEY}")
    print(f"  URL     : http://0.0.0.0:{port}")
    print("="*52)
    app.run(debug=False, host="0.0.0.0", port=port, threaded=True)

"""database.py — LudoKz database completo"""
import sqlite3, hashlib, os, re

if os.environ.get("RENDER"):
    DB = "/tmp/ludokz.db"
else:
    DB = os.path.join(os.path.dirname(__file__), "ludokz.db")

BLOCKED_DOMAINS = {
    "mailinator.com","guerrillamail.com","tempmail.com","throwam.com",
    "trashmail.com","yopmail.com","fakeinbox.com","sharklasers.com",
    "guerrillamailblock.com","grr.la","guerrillamail.info","spam4.me",
    "maildrop.cc","dispostable.com","mailnull.com","spamgourmet.com",
    "trashmail.me","discard.email","spamhereplease.com","mailnesia.com",
    "tempr.email","ownmail.net","spamevader.com","0-mail.com","mt2015.com",
    "mailexpire.com","throwaway.email","getnada.com","moakt.com","spamwc.de"
}

def _c():
    c = sqlite3.connect(DB, check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA foreign_keys=ON")
    return c

def init_db():
    c = _c()
    c.executescript("""
    CREATE TABLE IF NOT EXISTS users(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        balance REAL NOT NULL DEFAULT 0,
        express_number TEXT DEFAULT '',
        phone_verified INTEGER DEFAULT 0,
        age_confirmed INTEGER DEFAULT 0,
        terms_accepted INTEGER DEFAULT 0,
        reset_token TEXT DEFAULT '',
        reset_expires TEXT DEFAULT '',
        games_played INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        total_earned REAL DEFAULT 0,
        referral_code TEXT DEFAULT '',
        referred_by INTEGER DEFAULT 0,
        bonus_claimed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT(datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS otp_codes(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT NOT NULL,
        code TEXT NOT NULL,
        purpose TEXT DEFAULT 'register',
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TEXT DEFAULT(datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS deposits(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        express_ref TEXT NOT NULL,
        payer_name TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        note TEXT DEFAULT '',
        created_at TEXT DEFAULT(datetime('now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS withdrawals(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        net_amount REAL NOT NULL,
        express_number TEXT NOT NULL,
        account_name TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        note TEXT DEFAULT '',
        created_at TEXT DEFAULT(datetime('now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS transactions(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT(datetime('now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS game_history(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT,
        players TEXT,
        winner_id INTEGER,
        bet REAL NOT NULL,
        prize REAL NOT NULL,
        rounds INTEGER DEFAULT 0,
        played_at TEXT DEFAULT(datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS promo_codes(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        bonus_amount REAL NOT NULL,
        max_uses INTEGER DEFAULT 100,
        uses INTEGER DEFAULT 0,
        expires_at TEXT DEFAULT '',
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT(datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS referrals(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referrer_id INTEGER NOT NULL,
        referred_id INTEGER NOT NULL,
        bonus_paid INTEGER DEFAULT 0,
        created_at TEXT DEFAULT(datetime('now')),
        FOREIGN KEY(referrer_id) REFERENCES users(id),
        FOREIGN KEY(referred_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS daily_bonus(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER UNIQUE NOT NULL,
        last_claim TEXT DEFAULT '',
        streak INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS support_tickets(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        reply TEXT DEFAULT '',
        status TEXT DEFAULT 'open',
        created_at TEXT DEFAULT(datetime('now')),
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS admin_notifications(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT DEFAULT '{}',
        read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT(datetime('now'))
    );
    """)
    c.commit(); c.close()

def _h(p): return hashlib.sha256(p.encode()).hexdigest()

# ── OTP ──────────────────────────────────────────────────────────────
def criar_otp(phone, purpose='register'):
    from datetime import datetime, timedelta
    code = str(__import__('random').randint(100000, 999999))
    expires = (datetime.now() + timedelta(minutes=2)).isoformat()
    c = _c()
    c.execute("UPDATE otp_codes SET used=1 WHERE phone=? AND purpose=? AND used=0", (phone, purpose))
    c.execute("INSERT INTO otp_codes(phone,code,purpose,expires_at) VALUES(?,?,?,?)",
              (phone, code, purpose, expires))
    c.commit(); c.close()
    return code

def verificar_otp(phone, code, purpose='register'):
    from datetime import datetime
    c = _c()
    row = c.execute(
        "SELECT * FROM otp_codes WHERE phone=? AND code=? AND purpose=? AND used=0 ORDER BY created_at DESC LIMIT 1",
        (phone, code, purpose)
    ).fetchone()
    if not row: c.close(); return False, "Código inválido."
    row = dict(row)
    if row['expires_at'] < datetime.now().isoformat():
        c.close(); return False, "Código expirado. Pede um novo."
    c.execute("UPDATE otp_codes SET used=1 WHERE id=?", (row['id'],))
    c.commit(); c.close()
    return True, "OK"

def marcar_telefone_verificado(phone):
    c = _c(); c.execute("UPDATE users SET phone_verified=1 WHERE phone=?", (phone,))
    c.commit(); c.close()

def validate_email(email):
    email = email.lower().strip()
    if not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email):
        return False, "Email inválido."
    domain = email.split('@')[1]
    if domain in BLOCKED_DOMAINS:
        return False, "Emails temporários/falsos não são permitidos. Usa um email real."
    if len(domain.split('.')[-1]) < 2:
        return False, "Domínio de email inválido."
    return True, "OK"

def create_user(phone, pw, name, age_confirmed=False, terms_accepted=False, ref_code=""):
    c = _c()
    try:
        r = c.execute(
            "INSERT INTO users(phone,password,name,phone_verified,age_confirmed,terms_accepted) VALUES(?,?,?,0,?,?)",
            (phone, _h(pw), name.strip(), 1 if age_confirmed else 0, 1 if terms_accepted else 0))
        c.commit(); uid = r.lastrowid
    except Exception as e:
        c.close(); raise ValueError("Número já registado.") from e
    finally:
        try: c.close()
        except: pass

    # Invalidar todos os OTPs pendentes deste número após registo concluído
    c2 = _c()
    c2.execute("UPDATE otp_codes SET used=1 WHERE phone=? AND used=0", (phone,))
    c2.commit(); c2.close()

    set_referral_code(uid)
    if ref_code:
        referrer = get_user_by_refcode(ref_code)
        if referrer and referrer['id'] != uid:
            register_referral(referrer['id'], uid)
    add_admin_notif("new_user", f"Novo utilizador: {name} ({phone})", {"uid": uid, "phone": phone})
    return uid

def get_user_by_phone(phone):
    c = _c(); r = c.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone(); c.close()
    return dict(r) if r else None

def get_user_by_email(email):
    return get_user_by_phone(email)

def verify_user(phone, pw):
    c = _c(); r = c.execute("SELECT * FROM users WHERE phone=? AND password=?",
                             (phone, _h(pw))).fetchone(); c.close()
    return dict(r) if r else None

def get_user(uid):
    c = _c(); r = c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone(); c.close()
    return dict(r) if r else None

def set_express(uid, num):
    c = _c(); c.execute("UPDATE users SET express_number=? WHERE id=?", (num, uid))
    c.commit(); c.close()

def set_reset_token(uid, token, expires):
    c = _c(); c.execute("UPDATE users SET reset_token=?,reset_expires=? WHERE id=?",
                        (token, expires, uid)); c.commit(); c.close()

def verify_reset_token(token):
    from datetime import datetime
    c = _c()
    r = c.execute("SELECT * FROM users WHERE reset_token=?", (token,)).fetchone()
    c.close()
    if not r: return None
    r = dict(r)
    if r['reset_expires'] < datetime.now().isoformat(): return None
    return r

def reset_password(uid, new_pw):
    c = _c()
    c.execute("UPDATE users SET password=?,reset_token='',reset_expires='' WHERE id=?",
              (_h(new_pw), uid)); c.commit(); c.close()

def deduct_bet(uid, amount):
    c = _c()
    row = c.execute("SELECT balance FROM users WHERE id=?", (uid,)).fetchone()
    if not row or row['balance'] < amount: c.close(); return False
    c.execute("UPDATE users SET balance=balance-? WHERE id=?", (amount, uid))
    c.commit(); c.close(); return True

def refund_bet(uid, amount):
    c = _c(); c.execute("UPDATE users SET balance=balance+? WHERE id=?", (amount, uid))
    c.commit(); c.close()

def credit_prize(winner_id, loser_ids, bet, prize, rounds, room_id=""):
    c = _c()
    c.execute("""UPDATE users SET balance=balance+?,games_played=games_played+1,
        wins=wins+1,total_earned=total_earned+? WHERE id=?""", (prize, prize, winner_id))
    for lid in loser_ids:
        c.execute("UPDATE users SET games_played=games_played+1,losses=losses+1 WHERE id=?", (lid,))
    import json
    all_players = [winner_id] + list(loser_ids)
    c.execute("INSERT INTO game_history(room_id,players,winner_id,bet,prize,rounds) VALUES(?,?,?,?,?,?)",
              (room_id, json.dumps(all_players), winner_id, bet, prize, rounds))
    c.commit(); c.close()

def add_tx(uid, t, amount, desc):
    c = _c(); c.execute("INSERT INTO transactions(user_id,type,amount,description) VALUES(?,?,?,?)",
                        (uid, t, amount, desc)); c.commit(); c.close()

def get_transactions(uid, limit=40):
    c = _c(); rows = c.execute("SELECT * FROM transactions WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
                                (uid, limit)).fetchall(); c.close()
    return [dict(r) for r in rows]

def get_user_games(uid, limit=30):
    import json
    c = _c()
    rows = c.execute("SELECT * FROM game_history WHERE players LIKE ? ORDER BY played_at DESC LIMIT ?",
                     (f'%{uid}%', limit)).fetchall()
    c.close()
    out = []
    for r in rows:
        d = dict(r)
        players = json.loads(d.get('players','[]'))
        d['is_win'] = (d['winner_id'] == uid)
        out.append(d)
    return out

# --- DEPOSITOS ---
def create_deposit(uid, amount, ref, payer_name=""):
    c = _c()
    r = c.execute("INSERT INTO deposits(user_id,amount,express_ref,payer_name) VALUES(?,?,?,?)",
                  (uid, amount, ref, payer_name))
    c.commit(); did = r.lastrowid; c.close()
    u = get_user(uid)
    add_admin_notif("deposit_request",
        f"💰 DEPÓSITO: {u['name']} pediu {amount:,.0f} Kz (ref: {ref})",
        {"uid": uid, "amount": amount, "ref": ref, "dep_id": did, "payer": payer_name})
    return did

def approve_deposit(did, note=""):
    c = _c()
    dep = c.execute("SELECT * FROM deposits WHERE id=? AND status='pending'", (did,)).fetchone()
    if not dep: c.close(); return False
    dep = dict(dep)
    c.execute("UPDATE deposits SET status='approved',note=? WHERE id=?", (note, did))
    c.execute("UPDATE users SET balance=balance+? WHERE id=?", (dep['amount'], dep['user_id']))
    c.execute("INSERT INTO transactions(user_id,type,amount,description) VALUES(?,?,?,?)",
              (dep['user_id'], 'deposit', dep['amount'], f"Depósito aprovado (ref:{dep['express_ref']})"))
    c.commit(); c.close(); return True

def reject_deposit(did, note=""):
    c = _c(); c.execute("UPDATE deposits SET status='rejected',note=? WHERE id=?", (note, did))
    c.commit(); c.close()

def get_pending_deposits():
    c = _c()
    rows = c.execute("""SELECT d.*,u.name,u.phone,u.balance FROM deposits d
        JOIN users u ON u.id=d.user_id
        WHERE d.status='pending' ORDER BY d.created_at DESC""").fetchall()
    c.close(); return [dict(r) for r in rows]

def get_user_deposits(uid, limit=15):
    c = _c(); rows = c.execute("SELECT * FROM deposits WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
                                (uid, limit)).fetchall(); c.close()
    return [dict(r) for r in rows]

# --- LEVANTAMENTOS ---
def create_withdrawal(uid, amount, express_num, account_name):
    if amount < 1000: return None, "Minimo 1.000 Kz"
    if not account_name or len(account_name.strip()) < 3:
        return None, "Nome da conta obrigatorio para verificacao."
    taxa_casa = round(amount * 0.05, 2)
    taxa_afiliado = round(amount * 0.05, 2)
    net = round(amount - taxa_casa - taxa_afiliado, 2)
    c = _c()
    row = c.execute("SELECT balance, name, referred_by FROM users WHERE id=?", (uid,)).fetchone()
    if not row or row['balance'] < amount: c.close(); return None, "Saldo insuficiente"

    # Verificar se tem bonus — se sim, precisa de 5 convites para sacar
    bonus_tx = c.execute(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id=? AND type IN ('daily_bonus', 'promo', 'referral_bonus')",
        (uid,)
    ).fetchone()
    total_bonus = bonus_tx['total'] if bonus_tx else 0
    if total_bonus > 0:
        total_referidos = c.execute(
            "SELECT COUNT(*) as n FROM referrals WHERE referrer_id=?", (uid,)
        ).fetchone()['n']
        if total_referidos < 5:
            c.close()
            return None, f"Para sacar com bonus precisas de convidar 5 pessoas. Tens {total_referidos}/5."

    c.execute("UPDATE users SET balance=balance-? WHERE id=?", (amount, uid))
    r = c.execute("INSERT INTO withdrawals(user_id,amount,net_amount,express_number,account_name) VALUES(?,?,?,?,?)",
                  (uid, amount, net, express_num, account_name))
    c.execute("INSERT INTO transactions(user_id,type,amount,description) VALUES(?,?,?,?)",
              (uid, 'withdrawal_pending', -amount, f"Pedido levantamento -> {express_num}"))

    # Pagar 5% ao afiliado se existir
    referrer_id = row['referred_by']
    if referrer_id:
        c.execute("UPDATE users SET balance=balance+? WHERE id=?", (taxa_afiliado, referrer_id))
        c.execute("INSERT INTO transactions(user_id,type,amount,description) VALUES(?,?,?,?)",
                  (referrer_id, 'affiliate_bonus', taxa_afiliado,
                   f"Comissao afiliado 5% do levantamento de uid {uid}"))

    c.commit(); wid = r.lastrowid; c.close()
    u = get_user(uid)
    add_admin_notif("withdrawal_request",
        f"LEVANTAMENTO: {u['name']} quer sacar {amount:,.0f} Kz -> {express_num} ({account_name})",
        {"uid": uid, "amount": amount, "net": net, "express": express_num,
         "account_name": account_name, "wid": wid})
    return wid, None

def complete_withdrawal(wid, note=""):
    c = _c()
    w = c.execute("SELECT * FROM withdrawals WHERE id=? AND status='pending'", (wid,)).fetchone()
    if not w: c.close(); return False
    w = dict(w)
    c.execute("UPDATE withdrawals SET status='completed',note=? WHERE id=?", (note, wid))
    c.execute("INSERT INTO transactions(user_id,type,amount,description) VALUES(?,?,?,?)",
              (w['user_id'], 'withdrawal', -w['amount'],
               f"Levantamento enviado → {w['express_number']}"))
    c.commit(); c.close(); return True

def reject_withdrawal(wid, note=""):
    c = _c()
    w = c.execute("SELECT * FROM withdrawals WHERE id=? AND status='pending'", (wid,)).fetchone()
    if not w: c.close(); return False
    w = dict(w)
    c.execute("UPDATE users SET balance=balance+? WHERE id=?", (w['amount'], w['user_id']))
    c.execute("UPDATE withdrawals SET status='rejected',note=? WHERE id=?", (note, wid))
    c.execute("INSERT INTO transactions(user_id,type,amount,description) VALUES(?,?,?,?)",
              (w['user_id'], 'refund', w['amount'], "Levantamento rejeitado - saldo devolvido"))
    c.commit(); c.close(); return True

def get_pending_withdrawals():
    c = _c()
    rows = c.execute("""SELECT w.*,u.name,u.phone FROM withdrawals w
        JOIN users u ON u.id=w.user_id
        WHERE w.status='pending' ORDER BY w.created_at DESC""").fetchall()
    c.close(); return [dict(r) for r in rows]

def get_user_withdrawals(uid, limit=15):
    c = _c(); rows = c.execute("SELECT * FROM withdrawals WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
                                (uid, limit)).fetchall(); c.close()
    return [dict(r) for r in rows]

# --- NOTIFICACOES ADMIN ---
def add_admin_notif(ntype, message, data=None):
    import json
    c = _c()
    c.execute("INSERT INTO admin_notifications(type,message,data) VALUES(?,?,?)",
              (ntype, message, json.dumps(data or {})))
    c.commit(); c.close()

def get_admin_notifs(unread_only=False, limit=50):
    import json
    c = _c()
    q = "SELECT * FROM admin_notifications"
    if unread_only: q += " WHERE read=0"
    q += " ORDER BY created_at DESC LIMIT ?"
    rows = c.execute(q, (limit,)).fetchall(); c.close()
    out = []
    for r in rows:
        d = dict(r)
        try: d['data'] = json.loads(d['data'])
        except: d['data'] = {}
        out.append(d)
    return out

def mark_notifs_read():
    c = _c(); c.execute("UPDATE admin_notifications SET read=1"); c.commit(); c.close()

def get_all_users(limit=100):
    c = _c(); rows = c.execute("SELECT * FROM users ORDER BY created_at DESC LIMIT ?",
                                (limit,)).fetchall(); c.close()
    return [dict(r) for r in rows]

# ── REFERIDOS ──────────────────────────────────────────
import random, string as _string

def gen_ref_code():
    return "".join(random.choices(_string.ascii_uppercase + _string.digits, k=8))

def set_referral_code(uid):
    code = gen_ref_code()
    c = _c()
    c.execute("UPDATE users SET referral_code=? WHERE id=?", (code, uid))
    c.commit(); c.close()
    return code

def get_user_by_refcode(code):
    c = _c(); r = c.execute("SELECT * FROM users WHERE referral_code=?", (code,)).fetchone(); c.close()
    return dict(r) if r else None

def register_referral(referrer_id, referred_id):
    REFERRAL_BONUS = 500
    c = _c()
    ex = c.execute("SELECT id FROM referrals WHERE referred_id=?", (referred_id,)).fetchone()
    if ex: c.close(); return
    c.execute("INSERT INTO referrals(referrer_id,referred_id) VALUES(?,?)", (referrer_id, referred_id))
    c.execute("UPDATE users SET balance=balance+? WHERE id=?", (REFERRAL_BONUS, referrer_id))
    c.execute("INSERT INTO transactions(user_id,type,amount,description) VALUES(?,?,?,?)",
              (referrer_id,'referral_bonus', REFERRAL_BONUS, f"Bónus referido: novo utilizador"))
    c.execute("UPDATE referrals SET bonus_paid=1 WHERE referred_id=?", (referred_id,))
    c.commit(); c.close()

def get_referrals(uid):
    c = _c()
    rows = c.execute("""SELECT r.*,u.name,u.created_at uc FROM referrals r
        JOIN users u ON u.id=r.referred_id WHERE r.referrer_id=?
        ORDER BY r.created_at DESC""", (uid,)).fetchall()
    c.close(); return [dict(r) for r in rows]

# ── PROMO CODES ──────────────────────────────────────
def create_promo(code, amount, max_uses=100, expires=""):
    c = _c()
    c.execute("INSERT OR REPLACE INTO promo_codes(code,bonus_amount,max_uses,expires_at) VALUES(?,?,?,?)",
              (code.upper().strip(), amount, max_uses, expires))
    c.commit(); c.close()

def use_promo(uid, code):
    from datetime import datetime
    c = _c()
    row = c.execute("SELECT * FROM promo_codes WHERE code=? AND active=1", (code.upper().strip(),)).fetchone()
    if not row: c.close(); return False, "Código inválido ou expirado."
    row = dict(row)
    if row['uses'] >= row['max_uses']: c.close(); return False, "Código esgotado."
    if row['expires_at'] and row['expires_at'] < datetime.now().isoformat():
        c.close(); return False, "Código expirado."
    ex = c.execute("SELECT id FROM transactions WHERE user_id=? AND description LIKE ?",
                   (uid, f"%PROMO:{code.upper()}%")).fetchone()
    if ex: c.close(); return False, "Já usaste este código."
    amt = row['bonus_amount']
    c.execute("UPDATE promo_codes SET uses=uses+1 WHERE code=?", (code.upper().strip(),))
    c.execute("UPDATE users SET balance=balance+? WHERE id=?", (amt, uid))
    c.execute("INSERT INTO transactions(user_id,type,amount,description) VALUES(?,?,?,?)",
              (uid,'promo', amt, f"Bónus código PROMO:{code.upper()}"))
    c.commit(); c.close()
    return True, amt

def get_all_promos():
    c = _c(); rows = c.execute("SELECT * FROM promo_codes ORDER BY created_at DESC").fetchall(); c.close()
    return [dict(r) for r in rows]

# ── BÓNUS DIÁRIO ──────────────────────────────────────
DAILY_BONUSES = [500, 750, 1000, 1500, 2000, 2500, 5000]

def claim_daily(uid):
    from datetime import datetime, date
    today = date.today().isoformat()
    c = _c()
    row = c.execute("SELECT * FROM daily_bonus WHERE user_id=?", (uid,)).fetchone()
    if row:
        row = dict(row)
        if row['last_claim'] == today:
            c.close(); return False, "Já recebeste o bónus hoje. Volta amanhã!"
        from datetime import date as dt, timedelta
        yesterday = (dt.today() - timedelta(days=1)).isoformat()
        streak = row['streak'] + 1 if row['last_claim'] == yesterday else 1
        streak = min(streak, 7)
        c.execute("UPDATE daily_bonus SET last_claim=?,streak=? WHERE user_id=?", (today, streak, uid))
    else:
        streak = 1
        c.execute("INSERT INTO daily_bonus(user_id,last_claim,streak) VALUES(?,?,1)", (uid, today))
    amt = DAILY_BONUSES[min(streak-1, 6)]
    c.execute("UPDATE users SET balance=balance+? WHERE id=?", (amt, uid))
    c.execute("INSERT INTO transactions(user_id,type,amount,description) VALUES(?,?,?,?)",
              (uid,'daily_bonus', amt, f"Bónus diário — Dia {streak}"))
    c.commit(); c.close()
    return True, {"amount": amt, "streak": streak}

def get_daily_status(uid):
    from datetime import date, timedelta
    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    c = _c(); row = c.execute("SELECT * FROM daily_bonus WHERE user_id=?", (uid,)).fetchone(); c.close()
    if not row: return {"claimed": False, "streak": 0, "next": DAILY_BONUSES[0]}
    row = dict(row)
    claimed = row['last_claim'] == today
    streak = row['streak'] if row['last_claim'] in [today, yesterday] else 0
    next_streak = min(streak + (0 if claimed else 1), 7)
    return {"claimed": claimed, "streak": streak, "next": DAILY_BONUSES[max(next_streak-1,0)]}

# ── SUPORTE ──────────────────────────────────────────
def create_ticket(uid, message):
    c = _c()
    r = c.execute("INSERT INTO support_tickets(user_id,message) VALUES(?,?)", (uid, message))
    c.commit(); tid = r.lastrowid; c.close()
    u = get_user(uid)
    add_admin_notif("support_ticket",
        f"🎫 SUPORTE: {u['name']} — {message[:80]}...",
        {"uid": uid, "tid": tid, "message": message})
    return tid

def reply_ticket(tid, reply):
    c = _c(); c.execute("UPDATE support_tickets SET reply=?,status='closed' WHERE id=?", (reply, tid))
    c.commit()
    row = c.execute("SELECT * FROM support_tickets WHERE id=?", (tid,)).fetchone(); c.close()
    return dict(row) if row else None

def get_user_tickets(uid):
    c = _c(); rows = c.execute("SELECT * FROM support_tickets WHERE user_id=? ORDER BY created_at DESC LIMIT 10", (uid,)).fetchall(); c.close()
    return [dict(r) for r in rows]

def get_all_tickets():
    c = _c(); rows = c.execute("""SELECT t.*,u.name,u.phone FROM support_tickets t
        JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC""").fetchall(); c.close()
    return [dict(r) for r in rows]

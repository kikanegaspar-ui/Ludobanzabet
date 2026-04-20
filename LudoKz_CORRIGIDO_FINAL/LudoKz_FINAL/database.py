"""database.py — LudoKz database completo (PostgreSQL/Supabase)"""
import hashlib, os, re, random, string as _string, json
import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres.lyytipmsqawiljvsjcds:vnfnjdjdkkdksf555d4f4fjksjdmfkASDFG@aws-0-eu-west-1.pooler.supabase.com:6543/postgres"
)

BLOCKED_DOMAINS = {
    "mailinator.com","guerrillamail.com","tempmail.com","throwam.com",
    "trashmail.com","yopmail.com","fakeinbox.com","sharklasers.com",
    "guerrillamailblock.com","grr.la","guerrillamail.info","spam4.me",
    "maildrop.cc","dispostable.com","mailnull.com","spamgourmet.com",
    "trashmail.me","discard.email","spamhereplease.com","mailnesia.com",
    "tempr.email","ownmail.net","spamevader.com","0-mail.com","mt2015.com",
    "mailexpire.com","throwaway.email","getnada.com","moakt.com","spamwc.de"
}

# Referidos: bónus a cada 5 registados
REFERRAL_BONUS_PER_GROUP = 500
REFERRAL_GROUP_SIZE      = 5

# Comissão da plataforma
PLATFORM_FEE = 0.10   # 10%

def _c():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    conn.autocommit = False
    return conn

def init_db():
    c = _c(); cur = c.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS users(
        id SERIAL PRIMARY KEY,
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
        welcome_bonus_claimed BOOLEAN DEFAULT FALSE,
        ten_games_bonus_claimed BOOLEAN DEFAULT FALSE,
        created_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS')
    );
    CREATE TABLE IF NOT EXISTS otp_codes(
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        code TEXT NOT NULL,
        purpose TEXT DEFAULT 'register',
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS')
    );
    CREATE TABLE IF NOT EXISTS deposits(
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        express_ref TEXT NOT NULL,
        payer_name TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        note TEXT DEFAULT '',
        created_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS'),
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS withdrawals(
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        net_amount REAL NOT NULL,
        express_number TEXT NOT NULL,
        account_name TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        note TEXT DEFAULT '',
        created_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS'),
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS transactions(
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS'),
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS game_history(
        id SERIAL PRIMARY KEY,
        room_id TEXT,
        players TEXT,
        winner_id INTEGER,
        bet REAL NOT NULL,
        prize REAL NOT NULL,
        rounds INTEGER DEFAULT 0,
        played_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS')
    );
    CREATE TABLE IF NOT EXISTS promo_codes(
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        bonus_amount REAL NOT NULL,
        max_uses INTEGER DEFAULT 100,
        uses INTEGER DEFAULT 0,
        expires_at TEXT DEFAULT '',
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS')
    );
    CREATE TABLE IF NOT EXISTS referrals(
        id SERIAL PRIMARY KEY,
        referrer_id INTEGER NOT NULL,
        referred_id INTEGER NOT NULL,
        bonus_paid INTEGER DEFAULT 0,
        created_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS'),
        FOREIGN KEY(referrer_id) REFERENCES users(id),
        FOREIGN KEY(referred_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS daily_bonus(
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL,
        last_claim TEXT DEFAULT '',
        streak INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS support_tickets(
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        reply TEXT DEFAULT '',
        status TEXT DEFAULT 'open',
        created_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS'),
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS admin_notifications(
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT DEFAULT '{}',
        read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS')
    );
    CREATE TABLE IF NOT EXISTS jackpot(
        id SERIAL PRIMARY KEY,
        value REAL NOT NULL DEFAULT 245000
    );
    """)

    # Migrações
    _migrations = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_bonus_claimed BOOLEAN DEFAULT FALSE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS ten_games_bonus_claimed BOOLEAN DEFAULT FALSE",
    ]
    for sql in _migrations:
        try:
            cur.execute(sql)
        except Exception:
            c.rollback()

    # ── REMOVER SALDOS DE BÓNUS DE TODOS OS UTILIZADORES ──
    # Zera saldo de todos os utilizadores que tenham saldo proveniente apenas de bónus
    # (saldo > 0 e nunca fizeram depósito aprovado)
    try:
        cur.execute("""
            UPDATE users
            SET balance = 0,
                welcome_bonus_claimed = FALSE,
                ten_games_bonus_claimed = FALSE
            WHERE id NOT IN (
                SELECT DISTINCT user_id FROM deposits WHERE status = 'approved'
            )
            AND balance > 0
        """)
        # Remove transações de bónus de boas-vindas e de 10 partidas
        cur.execute("""
            DELETE FROM transactions
            WHERE type IN ('welcome_bonus', 'ten_games_bonus')
        """)
    except Exception:
        c.rollback()

    # Jackpot inicial
    cur.execute("SELECT id FROM jackpot LIMIT 1")
    if not cur.fetchone():
        cur.execute("INSERT INTO jackpot(value) VALUES(245000)")

    c.commit(); cur.close(); c.close()

def _h(p): return hashlib.sha256(p.encode()).hexdigest()

# ── OTP ──────────────────────────────────────────────────────────────
def criar_otp(phone, purpose='register'):
    from datetime import datetime, timedelta
    code    = str(random.randint(100000, 999999))
    expires = (datetime.now() + timedelta(minutes=2)).isoformat()
    c = _c(); cur = c.cursor()
    cur.execute("UPDATE otp_codes SET used=1 WHERE phone=%s AND purpose=%s AND used=0", (phone, purpose))
    cur.execute("INSERT INTO otp_codes(phone,code,purpose,expires_at) VALUES(%s,%s,%s,%s)",
                (phone, code, purpose, expires))
    c.commit(); cur.close(); c.close()
    return code

def verificar_otp(phone, code, purpose='register'):
    from datetime import datetime
    c = _c(); cur = c.cursor()
    cur.execute(
        "SELECT * FROM otp_codes WHERE phone=%s AND code=%s AND purpose=%s AND used=0 ORDER BY created_at DESC LIMIT 1",
        (phone, code, purpose))
    row = cur.fetchone()
    if not row: cur.close(); c.close(); return False, "Código inválido."
    row = dict(row)
    if row['expires_at'] < datetime.now().isoformat():
        cur.close(); c.close(); return False, "Código expirado. Pede um novo."
    cur.execute("UPDATE otp_codes SET used=1 WHERE id=%s", (row['id'],))
    c.commit(); cur.close(); c.close()
    return True, "OK"

def marcar_telefone_verificado(phone):
    c = _c(); cur = c.cursor()
    cur.execute("UPDATE users SET phone_verified=1 WHERE phone=%s", (phone,))
    c.commit(); cur.close(); c.close()

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

# ── USERS ────────────────────────────────────────────────────────────
def create_user(phone, pw, name, age_confirmed=False, terms_accepted=False, ref_code=""):
    """Cria utilizador SEM bónus de boas-vindas. Saldo inicial = 0."""
    c = _c(); cur = c.cursor()
    try:
        cur.execute(
            """INSERT INTO users(phone,password,name,phone_verified,age_confirmed,terms_accepted,
               balance,welcome_bonus_claimed,ten_games_bonus_claimed)
               VALUES(%s,%s,%s,0,%s,%s,%s,TRUE,FALSE) RETURNING id""",
            (phone, _h(pw), name.strip(),
             1 if age_confirmed else 0,
             1 if terms_accepted else 0,
             0))   # saldo inicial ZERO — sem bónus
        uid = cur.fetchone()['id']
        c.commit()
    except Exception as e:
        c.rollback(); cur.close(); c.close()
        raise ValueError("Número já registado.") from e

    cur.execute("UPDATE otp_codes SET used=1 WHERE phone=%s AND used=0", (phone,))
    c.commit(); cur.close(); c.close()

    set_referral_code(uid)

    if ref_code:
        referrer = get_user_by_refcode(ref_code)
        if referrer and referrer['id'] != uid:
            register_referral(referrer['id'], uid)

    add_admin_notif("new_user", f"Novo utilizador: {name} ({phone})", {"uid": uid, "phone": phone})
    return uid

def get_user_by_phone(phone):
    c = _c(); cur = c.cursor()
    cur.execute("SELECT * FROM users WHERE phone=%s", (phone,))
    r = cur.fetchone(); cur.close(); c.close()
    return dict(r) if r else None

def get_user_by_email(email):
    return get_user_by_phone(email)

def verify_user(phone, pw):
    c = _c(); cur = c.cursor()
    cur.execute("SELECT * FROM users WHERE phone=%s AND password=%s", (phone, _h(pw)))
    r = cur.fetchone(); cur.close(); c.close()
    return dict(r) if r else None

def get_user(uid):
    c = _c(); cur = c.cursor()
    cur.execute("SELECT * FROM users WHERE id=%s", (uid,))
    r = cur.fetchone(); cur.close(); c.close()
    return dict(r) if r else None

def set_express(uid, num):
    c = _c(); cur = c.cursor()
    cur.execute("UPDATE users SET express_number=%s WHERE id=%s", (num, uid))
    c.commit(); cur.close(); c.close()

def set_reset_token(uid, token, expires):
    c = _c(); cur = c.cursor()
    cur.execute("UPDATE users SET reset_token=%s,reset_expires=%s WHERE id=%s", (token, expires, uid))
    c.commit(); cur.close(); c.close()

def verify_reset_token(token):
    from datetime import datetime
    c = _c(); cur = c.cursor()
    cur.execute("SELECT * FROM users WHERE reset_token=%s", (token,))
    r = cur.fetchone(); cur.close(); c.close()
    if not r: return None
    r = dict(r)
    if r['reset_expires'] < datetime.now().isoformat(): return None
    return r

def reset_password(uid, new_pw):
    c = _c(); cur = c.cursor()
    cur.execute("UPDATE users SET password=%s,reset_token='',reset_expires='' WHERE id=%s",
                (_h(new_pw), uid))
    c.commit(); cur.close(); c.close()

def deduct_bet(uid, amount):
    c = _c(); cur = c.cursor()
    cur.execute("SELECT balance FROM users WHERE id=%s FOR UPDATE", (uid,))
    row = cur.fetchone()
    if not row or float(row['balance']) < amount:
        c.rollback(); cur.close(); c.close(); return False
    cur.execute("UPDATE users SET balance=balance-%s WHERE id=%s", (amount, uid))
    c.commit(); cur.close(); c.close()
    return True

def refund_bet(uid, amount):
    c = _c(); cur = c.cursor()
    cur.execute("UPDATE users SET balance=balance+%s WHERE id=%s", (amount, uid))
    c.commit(); cur.close(); c.close()

def credit_prize(winner_id, loser_ids, bet, prize, rounds, room_id=""):
    c = _c(); cur = c.cursor()

    cur.execute("""
        UPDATE users
        SET balance      = balance + %s,
            games_played = games_played + 1,
            wins         = wins + 1,
            total_earned = total_earned + %s
        WHERE id = %s
    """, (prize, prize, winner_id))

    for lid in loser_ids:
        if lid > 0:
            cur.execute("""
                UPDATE users
                SET games_played = games_played + 1,
                    losses       = losses + 1
                WHERE id = %s
            """, (lid,))

    all_players = [winner_id] + list(loser_ids)
    cur.execute("""
        INSERT INTO game_history(room_id, players, winner_id, bet, prize, rounds)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (room_id, json.dumps(all_players), winner_id, bet, prize, rounds))

    c.commit(); cur.close(); c.close()

def add_tx(uid, t, amount, desc):
    c = _c(); cur = c.cursor()
    cur.execute(
        "INSERT INTO transactions(user_id,type,amount,description) VALUES(%s,%s,%s,%s)",
        (uid, t, amount, desc))
    c.commit(); cur.close(); c.close()

def get_transactions(uid, limit=40):
    c = _c(); cur = c.cursor()
    cur.execute(
        "SELECT * FROM transactions WHERE user_id=%s ORDER BY created_at DESC LIMIT %s",
        (uid, limit))
    rows = cur.fetchall(); cur.close(); c.close()
    return [dict(r) for r in rows]

def get_user_games(uid, limit=30):
    c = _c(); cur = c.cursor()
    cur.execute(
        "SELECT * FROM game_history WHERE players LIKE %s ORDER BY played_at DESC LIMIT %s",
        (f'%{uid}%', limit))
    rows = cur.fetchall(); cur.close(); c.close()
    out = []
    for r in rows:
        d = dict(r)
        d['is_win'] = (d['winner_id'] == uid)
        out.append(d)
    return out

# ── DEPÓSITOS ────────────────────────────────────────────────────────
def create_deposit(uid, amount, ref, payer_name=""):
    DAILY_LIMIT = 100000
    from datetime import date
    today = date.today().isoformat()
    c = _c(); cur = c.cursor()
    cur.execute(
        "SELECT COALESCE(SUM(amount),0) AS total FROM deposits WHERE user_id=%s AND status='approved' AND created_at LIKE %s",
        (uid, today + '%'))
    deposited_today = float(cur.fetchone()['total'] or 0)
    if deposited_today + amount > DAILY_LIMIT:
        cur.close(); c.close()
        remaining = DAILY_LIMIT - deposited_today
        raise ValueError(f"Limite diário atingido. Podes depositar mais {remaining:,.0f} Kz hoje.")

    cur.execute(
        "INSERT INTO deposits(user_id,amount,express_ref,payer_name) VALUES(%s,%s,%s,%s) RETURNING id",
        (uid, amount, ref, payer_name))
    did = cur.fetchone()['id']
    c.commit(); cur.close(); c.close()
    u = get_user(uid)
    add_admin_notif("deposit_request",
        f"💰 DEPÓSITO: {u['name']} pediu {amount:,.0f} Kz (ref: {ref})",
        {"uid": uid, "amount": amount, "ref": ref, "dep_id": did, "payer": payer_name})
    return did

def approve_deposit(did, note=""):
    c = _c(); cur = c.cursor()
    cur.execute("SELECT * FROM deposits WHERE id=%s AND status='pending'", (did,))
    dep = cur.fetchone()
    if not dep: cur.close(); c.close(); return False
    dep = dict(dep)
    cur.execute("UPDATE deposits SET status='approved',note=%s WHERE id=%s", (note, did))
    cur.execute("UPDATE users SET balance=balance+%s WHERE id=%s", (dep['amount'], dep['user_id']))
    cur.execute(
        "INSERT INTO transactions(user_id,type,amount,description) VALUES(%s,%s,%s,%s)",
        (dep['user_id'], 'deposit', dep['amount'],
         f"Depósito aprovado (ref:{dep['express_ref']})"))
    c.commit(); cur.close(); c.close()
    return True

def reject_deposit(did, note=""):
    c = _c(); cur = c.cursor()
    cur.execute("UPDATE deposits SET status='rejected',note=%s WHERE id=%s", (note, did))
    c.commit(); cur.close(); c.close()

def get_pending_deposits():
    c = _c(); cur = c.cursor()
    cur.execute("""
        SELECT d.*,u.name,u.phone,u.balance FROM deposits d
        JOIN users u ON u.id=d.user_id
        WHERE d.status='pending' ORDER BY d.created_at DESC
    """)
    rows = cur.fetchall(); cur.close(); c.close()
    return [dict(r) for r in rows]

def get_user_deposits(uid, limit=15):
    c = _c(); cur = c.cursor()
    cur.execute(
        "SELECT * FROM deposits WHERE user_id=%s ORDER BY created_at DESC LIMIT %s",
        (uid, limit))
    rows = cur.fetchall(); cur.close(); c.close()
    return [dict(r) for r in rows]

# ── LEVANTAMENTOS ────────────────────────────────────────────────────
def create_withdrawal(uid, amount, express_num, account_name):
    DAILY_LIMIT  = 50000
    MIN_AMOUNT   = 1000

    if amount < MIN_AMOUNT:
        return None, f"Mínimo {MIN_AMOUNT:,} Kz."
    if amount > DAILY_LIMIT:
        return None, f"Máximo {DAILY_LIMIT:,} Kz por dia."
    if not account_name or len(account_name.strip()) < 3:
        return None, "Nome da conta obrigatório para verificação."

    net = round(amount * (1 - PLATFORM_FEE), 2)

    from datetime import date
    today = date.today().isoformat()

    c = _c(); cur = c.cursor()

    cur.execute(
        "SELECT COALESCE(SUM(amount),0) AS total FROM withdrawals WHERE user_id=%s AND status IN ('pending','completed') AND created_at LIKE %s",
        (uid, today + '%'))
    withdrawn_today = float(cur.fetchone()['total'] or 0)
    if withdrawn_today + amount > DAILY_LIMIT:
        remaining = DAILY_LIMIT - withdrawn_today
        cur.close(); c.close()
        return None, f"Limite diário atingido. Podes sacar mais {remaining:,.0f} Kz hoje."

    cur.execute("SELECT balance FROM users WHERE id=%s FOR UPDATE", (uid,))
    row = cur.fetchone()
    if not row or float(row['balance']) < amount:
        cur.close(); c.close()
        return None, "Saldo insuficiente."

    cur.execute("UPDATE users SET balance=balance-%s WHERE id=%s", (amount, uid))

    cur.execute(
        "INSERT INTO withdrawals(user_id,amount,net_amount,express_number,account_name) VALUES(%s,%s,%s,%s,%s) RETURNING id",
        (uid, amount, net, express_num, account_name))
    wid = cur.fetchone()['id']

    cur.execute(
        "INSERT INTO transactions(user_id,type,amount,description) VALUES(%s,%s,%s,%s)",
        (uid, 'withdrawal_pending', -amount,
         f"Pedido levantamento → {express_num} ({account_name})"))

    c.commit(); cur.close(); c.close()

    u = get_user(uid)
    add_admin_notif("withdrawal_request",
        f"LEVANTAMENTO: {u['name']} quer sacar {amount:,.0f} Kz → {express_num} ({account_name})",
        {"uid": uid, "amount": amount, "net": net,
         "express": express_num, "account_name": account_name, "wid": wid})
    return wid, None

def complete_withdrawal(wid, note=""):
    c = _c(); cur = c.cursor()
    cur.execute("SELECT * FROM withdrawals WHERE id=%s AND status='pending'", (wid,))
    w = cur.fetchone()
    if not w: cur.close(); c.close(); return False
    w = dict(w)
    cur.execute("UPDATE withdrawals SET status='completed',note=%s WHERE id=%s", (note, wid))
    cur.execute(
        "INSERT INTO transactions(user_id,type,amount,description) VALUES(%s,%s,%s,%s)",
        (w['user_id'], 'withdrawal', -w['amount'],
         f"Levantamento enviado → {w['express_number']}"))
    c.commit(); cur.close(); c.close()
    return True

def reject_withdrawal(wid, note=""):
    c = _c(); cur = c.cursor()
    cur.execute("SELECT * FROM withdrawals WHERE id=%s AND status='pending'", (wid,))
    w = cur.fetchone()
    if not w: cur.close(); c.close(); return False
    w = dict(w)
    cur.execute("UPDATE users SET balance=balance+%s WHERE id=%s", (w['amount'], w['user_id']))
    cur.execute("UPDATE withdrawals SET status='rejected',note=%s WHERE id=%s", (note, wid))
    cur.execute(
        "INSERT INTO transactions(user_id,type,amount,description) VALUES(%s,%s,%s,%s)",
        (w['user_id'], 'refund', w['amount'],
         "Levantamento rejeitado — saldo devolvido"))
    c.commit(); cur.close(); c.close()
    return True

def get_pending_withdrawals():
    c = _c(); cur = c.cursor()
    cur.execute("""
        SELECT w.*,u.name,u.phone FROM withdrawals w
        JOIN users u ON u.id=w.user_id
        WHERE w.status='pending' ORDER BY w.created_at DESC
    """)
    rows = cur.fetchall(); cur.close(); c.close()
    return [dict(r) for r in rows]

def get_user_withdrawals(uid, limit=15):
    c = _c(); cur = c.cursor()
    cur.execute(
        "SELECT * FROM withdrawals WHERE user_id=%s ORDER BY created_at DESC LIMIT %s",
        (uid, limit))
    rows = cur.fetchall(); cur.close(); c.close()
    return [dict(r) for r in rows]

# ── REFERIDOS ────────────────────────────────────────────────────────
def gen_ref_code():
    return "".join(random.choices(_string.ascii_uppercase + _string.digits, k=8))

def set_referral_code(uid):
    code = gen_ref_code()
    c = _c(); cur = c.cursor()
    cur.execute("UPDATE users SET referral_code=%s WHERE id=%s", (code, uid))
    c.commit(); cur.close(); c.close()
    return code

def get_user_by_refcode(code):
    c = _c(); cur = c.cursor()
    cur.execute("SELECT * FROM users WHERE referral_code=%s", (code,))
    r = cur.fetchone(); cur.close(); c.close()
    return dict(r) if r else None

def register_referral(referrer_id, referred_id):
    c = _c(); cur = c.cursor()

    cur.execute("SELECT id FROM referrals WHERE referred_id=%s", (referred_id,))
    if cur.fetchone():
        cur.close(); c.close(); return

    cur.execute(
        "INSERT INTO referrals(referrer_id,referred_id,bonus_paid) VALUES(%s,%s,0)",
        (referrer_id, referred_id))

    cur.execute(
        "SELECT COUNT(*) AS n FROM referrals WHERE referrer_id=%s",
        (referrer_id,))
    total = int(cur.fetchone()['n'])

    if total % REFERRAL_GROUP_SIZE == 0:
        cur.execute(
            "UPDATE users SET balance=balance+%s WHERE id=%s",
            (REFERRAL_BONUS_PER_GROUP, referrer_id))
        cur.execute(
            "INSERT INTO transactions(user_id,type,amount,description) VALUES(%s,%s,%s,%s)",
            (referrer_id, 'referral_bonus', REFERRAL_BONUS_PER_GROUP,
             f"Bónus referidos: grupo de {REFERRAL_GROUP_SIZE} completado ({total} no total)"))

    c.commit(); cur.close(); c.close()

def get_referrals(uid):
    c = _c(); cur = c.cursor()
    cur.execute("""
        SELECT r.*,u.name,u.created_at AS uc FROM referrals r
        JOIN users u ON u.id=r.referred_id
        WHERE r.referrer_id=%s ORDER BY r.created_at DESC
    """, (uid,))
    rows = cur.fetchall(); cur.close(); c.close()
    return [dict(r) for r in rows]

# ── PROMO CODES ──────────────────────────────────────────────────────
def create_promo(code, amount, max_uses=100, expires=""):
    c = _c(); cur = c.cursor()
    cur.execute("""
        INSERT INTO promo_codes(code,bonus_amount,max_uses,expires_at) VALUES(%s,%s,%s,%s)
        ON CONFLICT(code) DO UPDATE SET bonus_amount=EXCLUDED.bonus_amount,
        max_uses=EXCLUDED.max_uses, expires_at=EXCLUDED.expires_at
    """, (code.upper().strip(), amount, max_uses, expires))
    c.commit(); cur.close(); c.close()

def use_promo(uid, code):
    from datetime import datetime
    c = _c(); cur = c.cursor()
    cur.execute("SELECT * FROM promo_codes WHERE code=%s AND active=1", (code.upper().strip(),))
    row = cur.fetchone()
    if not row: cur.close(); c.close(); return False, "Código inválido ou expirado."
    row = dict(row)
    if row['uses'] >= row['max_uses']:
        cur.close(); c.close(); return False, "Código esgotado."
    if row['expires_at'] and row['expires_at'] < datetime.now().isoformat():
        cur.close(); c.close(); return False, "Código expirado."
    cur.execute(
        "SELECT id FROM transactions WHERE user_id=%s AND description LIKE %s",
        (uid, f"%PROMO:{code.upper()}%"))
    if cur.fetchone():
        cur.close(); c.close(); return False, "Já usaste este código."
    amt = row['bonus_amount']
    cur.execute("UPDATE promo_codes SET uses=uses+1 WHERE code=%s", (code.upper().strip(),))
    cur.execute("UPDATE users SET balance=balance+%s WHERE id=%s", (amt, uid))
    cur.execute(
        "INSERT INTO transactions(user_id,type,amount,description) VALUES(%s,%s,%s,%s)",
        (uid, 'promo', amt, f"Bónus código PROMO:{code.upper()}"))
    c.commit(); cur.close(); c.close()
    return True, amt

def get_all_promos():
    c = _c(); cur = c.cursor()
    cur.execute("SELECT * FROM promo_codes ORDER BY created_at DESC")
    rows = cur.fetchall(); cur.close(); c.close()
    return [dict(r) for r in rows]

# ── BÓNUS DIÁRIO ──────────────────────────────────────────────────────
DAILY_BONUSES = [500, 750, 1000, 1500, 2000, 2500, 5000]

def claim_daily(uid):
    from datetime import datetime, date, timedelta
    today     = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    c = _c(); cur = c.cursor()
    cur.execute("SELECT * FROM daily_bonus WHERE user_id=%s", (uid,))
    row = cur.fetchone()
    if row:
        row = dict(row)
        if row['last_claim'] == today:
            cur.close(); c.close(); return False, "Já recebeste o bónus hoje. Volta amanhã!"
        streak = row['streak'] + 1 if row['last_claim'] == yesterday else 1
        streak = min(streak, 7)
        cur.execute(
            "UPDATE daily_bonus SET last_claim=%s,streak=%s WHERE user_id=%s",
            (today, streak, uid))
    else:
        streak = 1
        cur.execute(
            "INSERT INTO daily_bonus(user_id,last_claim,streak) VALUES(%s,%s,1)",
            (uid, today))
    amt = DAILY_BONUSES[min(streak - 1, 6)]
    cur.execute("UPDATE users SET balance=balance+%s WHERE id=%s", (amt, uid))
    cur.execute(
        "INSERT INTO transactions(user_id,type,amount,description) VALUES(%s,%s,%s,%s)",
        (uid, 'daily_bonus', amt, f"Bónus diário — Dia {streak}"))
    c.commit(); cur.close(); c.close()
    return True, {"amount": amt, "streak": streak}

def get_daily_status(uid):
    from datetime import date, timedelta
    today     = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    c = _c(); cur = c.cursor()
    cur.execute("SELECT * FROM daily_bonus WHERE user_id=%s", (uid,))
    row = cur.fetchone(); cur.close(); c.close()
    if not row:
        return {"claimed": False, "streak": 0, "next": DAILY_BONUSES[0]}
    row = dict(row)
    claimed      = row['last_claim'] == today
    streak       = row['streak'] if row['last_claim'] in [today, yesterday] else 0
    next_streak  = min(streak + (0 if claimed else 1), 7)
    return {"claimed": claimed, "streak": streak,
            "next": DAILY_BONUSES[max(next_streak - 1, 0)]}

# ── SUPORTE ──────────────────────────────────────────────────────────
def create_ticket(uid, message):
    c = _c(); cur = c.cursor()
    cur.execute(
        "INSERT INTO support_tickets(user_id,message) VALUES(%s,%s) RETURNING id",
        (uid, message))
    tid = cur.fetchone()['id']
    c.commit(); cur.close(); c.close()
    u = get_user(uid)
    add_admin_notif("support_ticket",
        f"🎫 SUPORTE: {u['name']} — {message[:80]}...",
        {"uid": uid, "tid": tid, "message": message})
    return tid

def reply_ticket(tid, reply):
    c = _c(); cur = c.cursor()
    cur.execute(
        "UPDATE support_tickets SET reply=%s,status='closed' WHERE id=%s",
        (reply, tid))
    cur.execute("SELECT * FROM support_tickets WHERE id=%s", (tid,))
    row = cur.fetchone(); c.commit(); cur.close(); c.close()
    return dict(row) if row else None

def get_user_tickets(uid):
    c = _c(); cur = c.cursor()
    cur.execute(
        "SELECT * FROM support_tickets WHERE user_id=%s ORDER BY created_at DESC LIMIT 10",
        (uid,))
    rows = cur.fetchall(); cur.close(); c.close()
    return [dict(r) for r in rows]

def get_all_tickets():
    c = _c(); cur = c.cursor()
    cur.execute("""
        SELECT t.*,u.name,u.phone FROM support_tickets t
        JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC
    """)
    rows = cur.fetchall(); cur.close(); c.close()
    return [dict(r) for r in rows]

# ── NOTIFICAÇÕES ADMIN ───────────────────────────────────────────────
def add_admin_notif(ntype, message, data=None):
    c = _c(); cur = c.cursor()
    cur.execute(
        "INSERT INTO admin_notifications(type,message,data) VALUES(%s,%s,%s)",
        (ntype, message, json.dumps(data or {})))
    c.commit(); cur.close(); c.close()

def get_admin_notifs(unread_only=False, limit=50):
    c = _c(); cur = c.cursor()
    q = "SELECT * FROM admin_notifications"
    if unread_only: q += " WHERE read=0"
    q += " ORDER BY created_at DESC LIMIT %s"
    cur.execute(q, (limit,))
    rows = cur.fetchall(); cur.close(); c.close()
    out = []
    for r in rows:
        d = dict(r)
        try:   d['data'] = json.loads(d['data'])
        except: d['data'] = {}
        out.append(d)
    return out

def mark_notifs_read():
    c = _c(); cur = c.cursor()
    cur.execute("UPDATE admin_notifications SET read=1")
    c.commit(); cur.close(); c.close()

def get_all_users(limit=100):
    c = _c(); cur = c.cursor()
    cur.execute("SELECT * FROM users ORDER BY created_at DESC LIMIT %s", (limit,))
    rows = cur.fetchall(); cur.close(); c.close()
    return [dict(r) for r in rows]

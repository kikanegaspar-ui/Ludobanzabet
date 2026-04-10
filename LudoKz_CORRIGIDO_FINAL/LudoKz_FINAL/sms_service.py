import os
import requests

SMS_PROVIDER = os.environ.get("SMS_PROVIDER", "simulate").lower()

def formatar_numero_angola(num):
    num = ''.join(filter(str.isdigit, num))
    if num.startswith('244'):
        num = num[3:]
    if num.startswith('0'):
        num = num[1:]
    if len(num) != 9:
        return None, "Número deve ter 9 dígitos"
    if num[0] not in ['9', '8']:
        return None, "Número angolano inválido"
    return '+244' + num, None

def operadora(num):
    if num.startswith('+2449'):
        return 'Unitel'
    elif num.startswith('+2448'):
        return 'Movicel'
    return 'Desconhecida'

def _notificar_admin(numero_e164, codigo, nome, op, provider):
    try:
        from database import add_admin_notif
        add_admin_notif(
            "sms_sent",
            f"📱 SMS {provider} para {numero_e164} ({op}) | CÓDIGO: {codigo}",
            {"numero": numero_e164, "operadora": op, "nome": nome, "provider": provider, "codigo": codigo}
        )
    except Exception:
        pass

def _enviar_ombala(numero_e164: str, mensagem: str):
    token     = os.environ.get("OMBALA_TOKEN", "")
    remetente = os.environ.get("OMBALA_SENDER", "936837429")
    if not token:
        return False, "OMBALA_TOKEN não configurado"
    numero = numero_e164.replace('+244', '').replace('+', '')
    url = "https://api.useombala.ao/v1/messages"
    headers = {"Authorization": f"Token {token}", "Content-Type": "application/json"}
    payload = {"message": mensagem, "from": remetente, "to": numero}
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=15)
        if resp.status_code == 201:
            return True, "SMS enviado via Ombala"
        try:
            detalhe = resp.json()
        except Exception:
            detalhe = resp.text
        return False, f"Ombala erro {resp.status_code}: {detalhe}"
    except requests.exceptions.Timeout:
        return False, "Timeout — Ombala não respondeu"
    except Exception as e:
        return False, f"Erro Ombala: {e}"

def _enviar_simulado(numero_e164, codigo, nome, mensagem):
    try:
        from database import add_admin_notif
        add_admin_notif(
            "sms_sent",
            f"📱 SMS SIMULADO para {numero_e164}: CÓDIGO {codigo}",
            {"numero": numero_e164, "codigo": codigo, "mensagem": mensagem, "nome": nome}
        )
    except Exception:
        pass
    print(f"[SMS SIMULADO] Para: {numero_e164} | Código: {codigo}")
    return True, mensagem

def enviar_sms_simulado(numero: str, codigo: str, nome: str = "utilizador"):
    numero_e164, erro = formatar_numero_angola(numero)
    if erro:
        return False, erro
    op = operadora(numero_e164)
    mensagem = (
        f"LudoKz: O teu codigo de verificacao e {codigo}. "
        f"Valido por 2 minutos. Nao partilhes com ninguem."
    )
    _notificar_admin(numero_e164, codigo, nome, op, SMS_PROVIDER.upper())
    if SMS_PROVIDER == "ombala":
        ok, msg = _enviar_ombala(numero_e164, mensagem)
        if not ok:
            print(f"[SMS] Ombala falhou: {msg} — usando simulado")
            return _enviar_simulado(numero_e164, codigo, nome, mensagem)
        return True, msg
    else:
        return _enviar_simulado(numero_e164, codigo, nome, mensagem)

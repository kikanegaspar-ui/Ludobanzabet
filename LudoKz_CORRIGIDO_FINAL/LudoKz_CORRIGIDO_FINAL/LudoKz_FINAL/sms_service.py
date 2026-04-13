import os
import urllib.request
import urllib.error
import json as _json

SMS_PROVIDER = os.environ.get("SMS_PROVIDER", "simulate").lower()

def formatar_numero_angola(num):
    num = ''.join(filter(str.isdigit, num))
    if num.startswith('244'):
        num = num[3:]
    if num.startswith('0'):
        num = num[1:]
    if len(num) != 9:
        return None, "Numero deve ter 9 digitos"
    if num[0] not in ['9', '8']:
        return None, "Numero angolano invalido"
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
            "SMS " + provider + " para " + numero_e164 + " (" + op + ") | CODIGO: " + codigo,
            {"numero": numero_e164, "operadora": op, "nome": nome, "provider": provider, "codigo": codigo}
        )
    except Exception:
        pass

def _enviar_ombala(numero_e164, mensagem):
    token     = os.environ.get("OMBALA_TOKEN", "")
    remetente = os.environ.get("OMBALA_SENDER", "936837429")
    if not token:
        return False, "OMBALA_TOKEN nao configurado"
    numero  = numero_e164.replace('+244', '').replace('+', '')
    payload = _json.dumps({"message": mensagem, "from": remetente, "to": numero}).encode('utf-8')
    req = urllib.request.Request(
        "https://api.useombala.ao/v1/messages",
        data=payload,
        headers={"Authorization": "Token " + token, "Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 201:
                return True, "SMS enviado via Ombala"
            return False, "Ombala erro " + str(resp.status)
    except urllib.error.HTTPError as e:
        try:
            detalhe = e.read().decode('utf-8')
        except Exception:
            detalhe = str(e)
        return False, "Ombala erro " + str(e.code) + ": " + detalhe
    except Exception as e:
        return False, "Erro Ombala: " + str(e)

def _enviar_simulado(numero_e164, codigo, nome, mensagem):
    try:
        from database import add_admin_notif
        add_admin_notif(
            "sms_sent",
            "SMS SIMULADO para " + numero_e164 + ": CODIGO " + codigo,
            {"numero": numero_e164, "codigo": codigo, "mensagem": mensagem, "nome": nome}
        )
    except Exception:
        pass
    print("[SMS SIMULADO] Para: " + numero_e164 + " | Codigo: " + codigo)
    return True, mensagem

def enviar_sms_simulado(numero, codigo, nome="utilizador"):
    numero_e164, erro = formatar_numero_angola(numero)
    if erro:
        return False, erro
    op       = operadora(numero_e164)
    mensagem = "LudoKz: O teu codigo de verificacao e " + codigo + ". Valido por 2 minutos. Nao partilhes com ninguem."
    _notificar_admin(numero_e164, codigo, nome, op, SMS_PROVIDER.upper())
    if SMS_PROVIDER == "ombala":
        ok, msg = _enviar_ombala(numero_e164, mensagem)
        if not ok:
            print("[SMS] Ombala falhou: " + msg + " - usando simulado")
            return _enviar_simulado(numero_e164, codigo, nome, mensagem)
        return True, msg
    else:
        return _enviar_simulado(numero_e164, codigo, nome, mensagem)

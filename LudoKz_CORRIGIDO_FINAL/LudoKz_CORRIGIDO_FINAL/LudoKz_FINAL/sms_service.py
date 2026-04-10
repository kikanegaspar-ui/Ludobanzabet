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

def _enviar_infobip(numero_e164: str, mensagem: str):
    api_key  = os.environ.get("INFOBIP_API_KEY", "")
    base_url = os.environ.get("INFOBIP_BASE_URL", "")
    sender   = os.environ.get("INFOBIP_SENDER", "InfoSMS")

    if not api_key or not base_url:
        return False, "INFOBIP_API_KEY ou INFOBIP_BASE_URL não configurado"

    url = f"https://{base_url}/sms/3/messages"
    headers = {
        "Authorization": f"App {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "messages": [{
            "destinations": [{"to": numero_e164.replace('+', '')}],
            "sender": sender,
            "content": {"text": mensagem}
        }]
    }

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=15)
        data = resp.json()
        status = data.get("messages", [{}])[0].get("status", {}).get("groupName", "")
        if status in ("PENDING", "DELIVERED"):
            return True, f"SMS enviado via Infobip (status: {status})"
        return False, f"Infobip erro: {data}"
    except Exception as e:
        return False, f"Erro Infobip: {e}"

def _enviar_simulado(numero_e164, codigo, nome, mensagem):
    try:
        from database import add_admin_notif
        add_admin_notif(
            "sms_sent",
            f"📱 SMS para {numero_e164}: CÓDIGO {codigo}",
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

    def _notificar_admin(provider):
        try:
            from database import add_admin_notif
            add_admin_notif(
                "sms_sent",
                f"📱 SMS {provider} para {numero_e164} ({op})",
                {"numero": numero_e164, "operadora": op, "nome": nome, "provider": provider}
            )
        except Exception:
            pass

    if SMS_PROVIDER == "infobip":
        ok, msg = _enviar_infobip(numero_e164, mensagem)
        if not ok:
            print(f"[SMS] Infobip falhou: {msg} — usando simulado")
            return _enviar_simulado(numero_e164, codigo, nome, mensagem)
        _notificar_admin("Infobip")
        return True, msg

    else:
        return _enviar_simulado(numero_e164, codigo, nome, mensagem)

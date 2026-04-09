"""
sms_service.py — Verificação por SMS Angola
Suporta: Unitel, Movicel, AfriCom
Integração real: Africa's Talking (AT) ou Twilio
"""
import os, json
from datetime import datetime

# ─────────────────────────────────────────────────
# Configuração — definir variáveis de ambiente:
#   SMS_PROVIDER = "africastalking" | "twilio" | "simulate"
#   AT_USERNAME  = "seu_username_africastalking"
#   AT_API_KEY   = "sua_api_key_africastalking"
#   AT_SENDER_ID = "LudoKz"  (opcional, aprovado pela AT)
#   TWILIO_SID   = "ACxxxxxxxxxx"
#   TWILIO_TOKEN = "seu_auth_token"
#   TWILIO_FROM  = "+14155552671"
# ─────────────────────────────────────────────────

SMS_PROVIDER = os.environ.get("SMS_PROVIDER", "simulate").lower()


def formatar_numero_angola(num):
    """Normaliza número angolano → retorna (+244XXXXXXXXX, None) ou (None, erro)"""
    num = ''.join(filter(str.isdigit, num))
    if num.startswith('244'):
        num = num[3:]
    if num.startswith('0'):
        num = num[1:]
    if len(num) != 9:
        return None, "Número deve ter 9 dígitos"
    if num[0] not in ['9', '8']:
        return None, "Número angolano inválido (deve começar com 9 ou 8)"
    return '+244' + num, None


def operadora(num):
    """Detecta operadora pelo prefixo"""
    if num.startswith('+2449'):
        return 'Unitel'
    elif num.startswith('+2448'):
        return 'Movicel'
    return 'Desconhecida'


def _enviar_africastalking(numero, mensagem):
    """Envia SMS via Africa's Talking API"""
    try:
        import africastalking
        username = os.environ.get("AT_USERNAME", "sandbox")
        api_key  = os.environ.get("AT_API_KEY", "")
        sender   = os.environ.get("AT_SENDER_ID", "LudoKz")

        africastalking.initialize(username, api_key)
        sms = africastalking.SMS

        resp = sms.send(mensagem, [numero], sender_id=sender if sender else None)
        recipients = resp.get("SMSMessageData", {}).get("Recipients", [])
        if recipients and recipients[0].get("statusCode") == 101:
            return True, "SMS enviado via Africa's Talking"
        error_msg = recipients[0].get("status", "Erro desconhecido") if recipients else "Sem resposta"
        return False, f"AT erro: {error_msg}"
    except ImportError:
        return False, "Pacote 'africastalking' não instalado. Corre: pip install africastalking"
    except Exception as e:
        return False, f"Erro Africa's Talking: {str(e)}"


def _enviar_twilio(numero, mensagem):
    """Envia SMS via Twilio"""
    try:
        from twilio.rest import Client
        sid   = os.environ.get("TWILIO_SID", "")
        token = os.environ.get("TWILIO_TOKEN", "")
        from_ = os.environ.get("TWILIO_FROM", "")

        if not sid or not token or not from_:
            return False, "Credenciais Twilio não configuradas (TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM)"

        client = Client(sid, token)
        message = client.messages.create(body=mensagem, from_=from_, to=numero)
        if message.status in ("queued", "sent", "delivered"):
            return True, f"SMS enviado via Twilio (SID: {message.sid})"
        return False, f"Twilio status: {message.status}"
    except ImportError:
        return False, "Pacote 'twilio' não instalado. Corre: pip install twilio"
    except Exception as e:
        return False, f"Erro Twilio: {str(e)}"


def _enviar_simulado(numero, codigo, nome):
    """
    Modo simulado — guarda na DB para o admin ver.
    Usa este modo enquanto não tens conta em AT ou Twilio.
    """
    mensagem = (
        f"LudoKz: O teu codigo de verificacao e {codigo}. "
        f"Valido por 2 minutos. Nao partilhes com ninguem."
    )
    try:
        from database import add_admin_notif
        add_admin_notif(
            "sms_sent",
            f"📱 SMS para {numero}: CÓDIGO {codigo}",
            {"numero": numero, "codigo": codigo, "mensagem": mensagem, "nome": nome}
        )
    except Exception:
        pass

    # Log sempre visível no servidor
    print(f"[SMS SIMULADO] ▶ Para: {numero} | Código: {codigo} | Nome: {nome}")
    print(f"  Mensagem: {mensagem}")
    print(f"  ⚠️  Defina SMS_PROVIDER=africastalking ou twilio para envio real.")
    return True, mensagem


def enviar_sms_simulado(numero, codigo, nome="utilizador"):
    """
    Ponto de entrada principal.
    Seleciona automaticamente o provider configurado:
      - SMS_PROVIDER=africastalking → Africa's Talking (recomendado para Angola)
      - SMS_PROVIDER=twilio         → Twilio
      - SMS_PROVIDER=simulate       → Modo simulado (para desenvolvimento)
    """
    mensagem = (
        f"LudoKz: O teu codigo de verificacao e {codigo}. "
        f"Valido por 2 minutos. Nao partilhes com ninguem."
    )

    if SMS_PROVIDER == "africastalking":
        ok, msg = _enviar_africastalking(numero, mensagem)
        if not ok:
            # Fallback para simulado em caso de erro
            print(f"[SMS] Africa's Talking falhou: {msg} — usando simulado")
            return _enviar_simulado(numero, codigo, nome)
        # Notificar admin que SMS foi enviado
        try:
            from database import add_admin_notif
            add_admin_notif("sms_sent", f"📱 SMS AT para {numero}", {"numero": numero, "nome": nome})
        except Exception:
            pass
        return True, msg

    elif SMS_PROVIDER == "twilio":
        ok, msg = _enviar_twilio(numero, mensagem)
        if not ok:
            print(f"[SMS] Twilio falhou: {msg} — usando simulado")
            return _enviar_simulado(numero, codigo, nome)
        try:
            from database import add_admin_notif
            add_admin_notif("sms_sent", f"📱 SMS Twilio para {numero}", {"numero": numero, "nome": nome})
        except Exception:
            pass
        return True, msg

    else:
        # Modo simulado (padrão)
        return _enviar_simulado(numero, codigo, nome)


# ─────────────────────────────────────────────────
# Instruções para ativar envio real:
#
# AFRICA'S TALKING (melhor para Angola):
#   1. Regista em: https://africastalking.com
#   2. Cria uma aplicação e obtém API KEY
#   3. pip install africastalking
#   4. Define variáveis:
#      export SMS_PROVIDER=africastalking
#      export AT_USERNAME=nome_da_tua_app
#      export AT_API_KEY=atsk_xxxxxxxx
#      export AT_SENDER_ID=LudoKz    (opcional, pede aprovação à AT)
#
# TWILIO:
#   1. Regista em: https://twilio.com
#   2. Compra número com capacidade SMS
#   3. pip install twilio
#   4. Define variáveis:
#      export SMS_PROVIDER=twilio
#      export TWILIO_SID=ACxxxxxxxxxx
#      export TWILIO_TOKEN=xxxxxxxxxx
#      export TWILIO_FROM=+1415xxxxxxx
# ─────────────────────────────────────────────────

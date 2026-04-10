"""
sms_service.py — Verificação por SMS Angola
Suporta: Mimo (nativo Angola), Africa's Talking, Twilio, Simulado

Variáveis de ambiente:
  SMS_PROVIDER   = "mimo" | "africastalking" | "twilio" | "simulate"
  MIMO_TOKEN     = "seu_token_mimo"
  MIMO_REMETENTE = "LudoKz"           (máx. 11 caracteres)
  AT_USERNAME    = "seu_username"
  AT_API_KEY     = "sua_api_key"
  AT_SENDER_ID   = "LudoKz"
  TWILIO_SID     = "ACxxxxxxxxxx"
  TWILIO_TOKEN   = "seu_auth_token"
  TWILIO_FROM    = "+14155552671"
"""

import os
import json
import requests
from datetime import datetime

SMS_PROVIDER = os.environ.get("SMS_PROVIDER", "simulate").lower()

# ─────────────────────────────────────────────────────────────
# Utilitários
# ─────────────────────────────────────────────────────────────

def formatar_numero_angola(num):
    """Normaliza número angolano.
    Retorna (+244XXXXXXXXX, None) em caso de sucesso ou (None, mensagem_erro).
    """
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
    """Detecta operadora pelo prefixo (+244...)"""
    if num.startswith('+2449'):
        return 'Unitel'
    elif num.startswith('+2448'):
        return 'Movicel'
    return 'Desconhecida'


def _numero_para_mimo(num_e164: str) -> str:
    """Converte +244923000000 → 244923000000 (formato Mimo)"""
    return num_e164.lstrip('+')


# ─────────────────────────────────────────────────────────────
# Providers
# ─────────────────────────────────────────────────────────────

def _enviar_mimo(numero_e164: str, mensagem: str):
    """
    Envia SMS via API Mimo Angola.
    Documentação: https://api.mimo.com.ao
    """
    token     = os.environ.get("MIMO_TOKEN", "")
    remetente = os.environ.get("MIMO_REMETENTE", "LudoKz")

    if not token:
        return False, "MIMO_TOKEN não configurado"

    url     = "https://api.mimo.com.ao/v1/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = {
        "sender":    remetente,
        "recipient": _numero_para_mimo(numero_e164),
        "text":      mensagem
    }

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=15)
        if resp.status_code == 201:
            return True, f"SMS enviado via Mimo (status 201)"
        # Tenta extrair mensagem de erro da API
        try:
            detalhe = resp.json().get("message", resp.text)
        except Exception:
            detalhe = resp.text
        return False, f"Mimo erro {resp.status_code}: {detalhe}"
    except requests.exceptions.Timeout:
        return False, "Timeout — API Mimo não respondeu"
    except Exception as e:
        return False, f"Erro Mimo: {e}"


def _enviar_africastalking(numero_e164: str, mensagem: str):
    """Envia SMS via Africa's Talking API"""
    try:
        import africastalking
        username = os.environ.get("AT_USERNAME", "sandbox")
        api_key  = os.environ.get("AT_API_KEY", "")
        sender   = os.environ.get("AT_SENDER_ID", "LudoKz")

        africastalking.initialize(username, api_key)
        sms = africastalking.SMS

        resp       = sms.send(mensagem, [numero_e164], sender_id=sender or None)
        recipients = resp.get("SMSMessageData", {}).get("Recipients", [])
        if recipients and recipients[0].get("statusCode") == 101:
            return True, "SMS enviado via Africa's Talking"
        erro = recipients[0].get("status", "Erro desconhecido") if recipients else "Sem resposta"
        return False, f"AT erro: {erro}"
    except ImportError:
        return False, "Pacote 'africastalking' não instalado. Corre: pip install africastalking"
    except Exception as e:
        return False, f"Erro Africa's Talking: {e}"


def _enviar_twilio(numero_e164: str, mensagem: str):
    """Envia SMS via Twilio"""
    try:
        from twilio.rest import Client
        sid   = os.environ.get("TWILIO_SID", "")
        token = os.environ.get("TWILIO_TOKEN", "")
        from_ = os.environ.get("TWILIO_FROM", "")

        if not all([sid, token, from_]):
            return False, "Credenciais Twilio incompletas (TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM)"

        client  = Client(sid, token)
        message = client.messages.create(body=mensagem, from_=from_, to=numero_e164)
        if message.status in ("queued", "sent", "delivered"):
            return True, f"SMS enviado via Twilio (SID: {message.sid})"
        return False, f"Twilio status: {message.status}"
    except ImportError:
        return False, "Pacote 'twilio' não instalado. Corre: pip install twilio"
    except Exception as e:
        return False, f"Erro Twilio: {e}"


def _enviar_simulado(numero_e164: str, codigo: str, nome: str, mensagem: str):
    """
    Modo de desenvolvimento — regista o envio sem chamar nenhuma API externa.
    Notifica o painel de admin se a função add_admin_notif estiver disponível.
    """
    try:
        from database import add_admin_notif
        add_admin_notif(
            "sms_sent",
            f"📱 SMS para {numero_e164}: CÓDIGO {codigo}",
            {"numero": numero_e164, "codigo": codigo, "mensagem": mensagem, "nome": nome}
        )
    except Exception:
        pass

    print(f"[SMS SIMULADO] ▶ Para: {numero_e164} | Código: {codigo} | Nome: {nome}")
    print(f"  Mensagem: {mensagem}")
    print(f"  ⚠️  Defina SMS_PROVIDER=mimo | africastalking | twilio para envio real.")
    return True, mensagem


# ─────────────────────────────────────────────────────────────
# Ponto de entrada principal
# ─────────────────────────────────────────────────────────────

def enviar_sms_simulado(numero: str, codigo: str, nome: str = "utilizador"):
    """
    Envia SMS de verificação para um número angolano.

    Parâmetros:
        numero  — número no formato 9XXXXXXXX, 244XXXXXXXXX ou +244XXXXXXXXX
        codigo  — código de verificação a enviar
        nome    — nome do utilizador (usado no log/admin)

    Retorna:
        (True, mensagem_info) em caso de sucesso
        (False, mensagem_erro) em caso de falha
    """
    # 1. Normalizar e validar número
    numero_e164, erro = formatar_numero_angola(numero)
    if erro:
        return False, erro

    op = operadora(numero_e164)
    mensagem = (
        f"LudoKz: O teu codigo de verificacao e {codigo}. "
        f"Valido por 2 minutos. Nao partilhes com ninguem."
    )

    def _notificar_admin(provider: str):
        try:
            from database import add_admin_notif
            add_admin_notif(
                "sms_sent",
                f"📱 SMS {provider} para {numero_e164} ({op})",
                {"numero": numero_e164, "operadora": op, "nome": nome, "provider": provider}
            )
        except Exception:
            pass

    # 2. Selecionar provider
    if SMS_PROVIDER == "mimo":
        ok, msg = _enviar_mimo(numero_e164, mensagem)
        if not ok:
            print(f"[SMS] Mimo falhou: {msg} — usando simulado")
            return _enviar_simulado(numero_e164, codigo, nome, mensagem)
        _notificar_admin("Mimo")
        return True, msg

    elif SMS_PROVIDER == "africastalking":
        ok, msg = _enviar_africastalking(numero_e164, mensagem)
        if not ok:
            print(f"[SMS] Africa's Talking falhou: {msg} — usando simulado")
            return _enviar_simulado(numero_e164, codigo, nome, mensagem)
        _notificar_admin("Africa's Talking")
        return True, msg

    elif SMS_PROVIDER == "twilio":
        ok, msg = _enviar_twilio(numero_e164, mensagem)
        if not ok:
            print(f"[SMS] Twilio falhou: {msg} — usando simulado")
            return _enviar_simulado(numero_e164, codigo, nome, mensagem)
        _notificar_admin("Twilio")
        return True, msg

    else:
        # Padrão: modo simulado (desenvolvimento)
        return _enviar_simulado(numero_e164, codigo, nome, mensagem)


# ─────────────────────────────────────────────────────────────
# Como ativar envio real
# ─────────────────────────────────────────────────────────────
#
# ── MIMO (nativo Angola, recomendado) ──────────────────────
#   1. Solicita acesso em: https://mimo.com.ao
#   2. Define variáveis:
#      export SMS_PROVIDER=mimo
#      export MIMO_TOKEN=seu_token_aqui
#      export MIMO_REMETENTE=LudoKz    (máx. 11 caracteres)
#
# ── AFRICA'S TALKING (alternativa Angola) ──────────────────
#   1. Regista em: https://africastalking.com
#   2. pip install africastalking
#   3. Define variáveis:
#      export SMS_PROVIDER=africastalking
#      export AT_USERNAME=nome_da_tua_app
#      export AT_API_KEY=atsk_xxxxxxxx
#      export AT_SENDER_ID=LudoKz
#
# ── TWILIO (internacional) ─────────────────────────────────
#   1. Regista em: https://twilio.com
#   2. pip install twilio
#   3. Define variáveis:
#      export SMS_PROVIDER=twilio
#      export TWILIO_SID=ACxxxxxxxxxx
#      export TWILIO_TOKEN=xxxxxxxxxx
#      export TWILIO_FROM=+1415xxxxxxx
# ─────────────────────────────────────────────────────────────

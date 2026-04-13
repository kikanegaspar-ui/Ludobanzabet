"""sms_service.py — LudoKz SMS via Ombala"""
import os
import requests

SMS_PROVIDER = os.environ.get("SMS_PROVIDER", "ombala").strip().lower()


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
            f"SMS {provider} para {numero_e164} ({op}) | CODIGO: {codigo}",
            {"numero": numero_e164, "operadora": op, "nome": nome,
             "provider": provider, "codigo": codigo}
        )
    except Exception:
        pass


def _enviar_ombala(numero_e164, mensagem):
    # .strip() evita espaços invisíveis copiados no Render
    token     = os.environ.get("OMBALA_TOKEN", "").strip()
    remetente = os.environ.get("OMBALA_SENDER", "936837429").strip()

    # Log de diagnóstico — mostra os primeiros 8 chars do token sem expor o resto
    print(f"[SMS OMBALA] SMS_PROVIDER={SMS_PROVIDER}")
    print(f"[SMS OMBALA] token_len={len(token)} | token_prefix={token[:8] if token else 'VAZIO'}")
    print(f"[SMS OMBALA] remetente={remetente} | destino={numero_e164}")

    if not token:
        print("[SMS OMBALA] ERRO: OMBALA_TOKEN está vazio ou não definido no Render")
        return False, "OMBALA_TOKEN não configurado"

    # A API Ombala espera só os 9 dígitos, sem +244
    numero = numero_e164.replace('+244', '').replace('+', '').strip()

    url     = "https://api.useombala.ao/v1/messages"
    headers = {
        "Authorization": "Token " + token,
        "Content-Type":  "application/json"
    }
    payload = {
        "message": mensagem,
        "from":    remetente,
        "to":      numero
    }

    print(f"[SMS OMBALA] Enviando para {numero} via remetente {remetente}...")

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=15)
        print(f"[SMS OMBALA] Status: {resp.status_code} | Body: {resp.text[:300]}")

        if resp.status_code in (200, 201):
            return True, "SMS enviado via Ombala"

        try:
            detalhe = resp.json()
        except Exception:
            detalhe = resp.text

        return False, f"Ombala erro {resp.status_code}: {detalhe}"

    except requests.exceptions.Timeout:
        return False, "Timeout — Ombala não respondeu em 15s"
    except Exception as e:
        return False, f"Erro Ombala: {e}"


def _enviar_simulado(numero_e164, codigo, nome, mensagem):
    try:
        from database import add_admin_notif
        add_admin_notif(
            "sms_sent",
            f"SMS SIMULADO para {numero_e164}: CODIGO {codigo}",
            {"numero": numero_e164, "codigo": codigo, "mensagem": mensagem, "nome": nome}
        )
    except Exception:
        pass
    print(f"[SMS SIMULADO] Para: {numero_e164} | Codigo: {codigo}")
    return True, mensagem


def enviar_sms_simulado(numero, codigo, nome="utilizador"):
    """Envia SMS real via Ombala (ou simulado se SMS_PROVIDER=simulate)."""

    # Formatar número
    if numero.startswith('+'):
        numero_e164 = numero
        erro = None
    else:
        numero_e164, erro = formatar_numero_angola(numero)

    if erro:
        return False, erro

    op = operadora(numero_e164)
    mensagem = (
        f"LudoKz: O teu codigo de verificacao e {codigo}. "
        f"Valido por 2 minutos. Nao partilhes com ninguem."
    )

    # Notificar painel admin sempre (independente do provider)
    _notificar_admin(numero_e164, codigo, nome, op, SMS_PROVIDER.upper())

    if SMS_PROVIDER == "ombala":
        ok, msg = _enviar_ombala(numero_e164, mensagem)
        if not ok:
            print(f"[SMS] Ombala falhou: {msg} — guardando no admin como fallback")
            _enviar_simulado(numero_e164, codigo, nome, mensagem)
            # Retorna True para não bloquear o registo do utilizador
            # O admin vê o código no painel mesmo sem SMS
            return True, f"SMS via admin (Ombala falhou: {msg})"
        return True, msg
    else:
        return _enviar_simulado(numero_e164, codigo, nome, mensagem)

import os
import json
import urllib.request
import urllib.error
import ssl

SMS_PROVIDER = os.environ.get("SMS_PROVIDER", "ombala").strip().lower()


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
            f"SMS {provider} para {numero_e164} ({op}) | CODIGO: {codigo}",
            {
                "numero": numero_e164,
                "operadora": op,
                "nome": nome,
                "provider": provider,
                "codigo": codigo
            }
        )
    except Exception:
        pass


def _enviar_ombala(numero_e164, mensagem):
    token     = os.environ.get("OMBALA_TOKEN", "").strip()
    remetente = os.environ.get("OMBALA_SENDER", "936837429").strip()

    if not token:
        print("[SMS OMBALA] ERRO: OMBALA_TOKEN vazio")
        return False, "OMBALA_TOKEN nao configurado"

    numero = numero_e164.replace('+244', '').replace('+', '').strip()
    print(f"[SMS OMBALA] token_prefix={token[:8]} | remetente={remetente} | destino={numero}")

    url     = "https://api.useombala.ao/v1/messages"
    payload = json.dumps({
        "message": mensagem,
        "from":    remetente,
        "to":      numero
    }).encode("utf-8")

    headers = {
        "Authorization": f"Token {token}",
        "Content-Type":  "application/json",
        "Accept":        "application/json",
    }

    try:
        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=20) as resp:
            body   = resp.read().decode("utf-8")
            status = resp.status
            print(f"[SMS OMBALA] HTTP {status} — {body[:200]}")
            if status == 201:
                return True, "SMS enviado via Ombala"
            return False, f"Ombala erro {status}: {body[:200]}"
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8") if e.fp else str(e)
        print(f"[SMS OMBALA] HTTPError {e.code}: {body[:200]}")
        return False, f"Ombala HTTP {e.code}: {body[:200]}"
    except Exception as e:
        print(f"[SMS OMBALA] Excecao: {e}")
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
    numero_e164, erro = formatar_numero_angola(numero)
    if erro:
        return False, erro

    op = operadora(numero_e164)
    mensagem = (
        f"LudoBanza: O teu codigo de verificacao e {codigo}. "
        f"Valido por 2 minutos. Nao partilhes com ninguem."
    )

    print(f"[SMS OMBALA] SMS_PROVIDER={SMS_PROVIDER}")
    _notificar_admin(numero_e164, codigo, nome, op, SMS_PROVIDER.upper())

    if SMS_PROVIDER == "ombala":
        ok, msg = _enviar_ombala(numero_e164, mensagem)
        if not ok:
            print(f"[SMS] Ombala falhou: {msg} — usando simulado")
            return _enviar_simulado(numero_e164, codigo, nome, mensagem)
        return True, msg
    else:
        return _enviar_simulado(numero_e164, codigo, nome, mensagem)

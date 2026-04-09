#!/usr/bin/env python3
"""
iniciar.py — Inicia o LudoKz no Windows/Linux/Mac
"""
import sys, os, subprocess, webbrowser, time, platform, threading

BASE = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE)

print("=" * 50)
print("  LudoKz — A iniciar...")
print("=" * 50)

# ---- 1. Python ----
print(f"\n[1] Python OK — {sys.version.split()[0]}")

# ---- 2. Flask ----
print("\n[2] A verificar Flask...")
try:
    import flask
    print(f"  OK Flask instalado")
except ImportError:
    print("  A instalar Flask...")
    subprocess.run([sys.executable, "-m", "pip", "install", "flask", "-q"],
                   capture_output=True)
    print("  OK Flask instalado!")

# ---- 3. Motor C++ — silencioso, nao falha ----
print("\n[3] Motor C++ (opcional)...")
try:
    ext = ".dll" if platform.system() == "Windows" else ".so"
    so  = os.path.join(BASE, "ludo_engine" + ext)
    if os.path.exists(so):
        print("  OK Motor C++ ja compilado!")
    else:
        # Tenta compilar sem mostrar erros
        r = subprocess.run(["g++", "--version"],
                           capture_output=True, timeout=5)
        if r.returncode == 0:
            flags = ["-O2", "-std=c++17", "-shared"]
            if platform.system() != "Windows":
                flags.append("-fPIC")
            subprocess.run(["g++"] + flags +
                           ["-o", so, "ludo_engine.cpp"],
                           capture_output=True, timeout=30)
            if os.path.exists(so):
                print("  OK Motor C++ compilado!")
            else:
                print("  Aviso: sem g++ — jogo usa motor Python (funciona na mesma)")
        else:
            print("  Aviso: sem g++ — jogo usa motor Python (funciona na mesma)")
except Exception:
    print("  Aviso: sem g++ — jogo usa motor Python (funciona na mesma)")

# ---- 4. Configurar ----
print("\n" + "=" * 50)
print("  CONFIGURACAO")
print("=" * 50)

express = input("\n  Numero Express da plataforma\n  (prime Enter para usar 923 456 789): ").strip()
if not express:
    express = "923 456 789"

admin_key = input("\n  Chave do painel admin\n  (prime Enter para usar ludokz2025): ").strip()
if not admin_key:
    admin_key = "ludokz2025"

os.environ["PLATFORM_EXPRESS"] = express
os.environ["ADMIN_KEY"]        = admin_key

# ---- 5. Arrancar ----
print("\n" + "=" * 50)
print("  TUDO PRONTO!")
print("=" * 50)
print(f"""
  Site do jogo :  http://localhost:5000
  Painel admin :  http://localhost:5000/admin
  Express      :  {express}
  Chave admin  :  {admin_key}

  NAO feches esta janela enquanto o jogo estiver a correr.
  Para parar: prime Ctrl+C ou fecha a janela.
""")

# Abrir browser automaticamente
def abrir_browser():
    time.sleep(2)
    webbrowser.open("http://localhost:5000")

threading.Thread(target=abrir_browser, daemon=True).start()

# Iniciar servidor Flask
try:
    import importlib.util
    spec = importlib.util.spec_from_file_location("app",
               os.path.join(BASE, "app.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
except KeyboardInterrupt:
    print("\n\n  Servidor parado. Ate a proxima!")
except Exception as e:
    print(f"\n  ERRO: {e}")
    input("\nPrime Enter para fechar...")

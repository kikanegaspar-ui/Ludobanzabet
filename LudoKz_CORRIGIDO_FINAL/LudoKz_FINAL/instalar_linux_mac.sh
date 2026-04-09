#!/bin/bash
# LudoKz — Instalador Linux/Mac
cd "$(dirname "$0")"
clear

echo ""
echo "  =========================================="
echo "    LudoKz | Instalador"
echo "  =========================================="
echo ""

# ---- Detectar SO ----
OS="linux"
if [[ "$OSTYPE" == "darwin"* ]]; then OS="mac"; fi
echo "  Sistema: $OS"
echo ""

# ---- Python ----
echo "[1/3] A verificar Python..."
if command -v python3 &>/dev/null; then
    echo "  [OK] $(python3 --version)"
else
    echo "  [ERRO] Python3 nao encontrado."
    if [ "$OS" = "mac" ]; then
        echo "  Solucao: Instala Homebrew e corre: brew install python3"
        echo "  Ou vai a: https://python.org/downloads"
    else
        echo "  Solucao: sudo apt install python3 python3-pip"
    fi
    read -p "  Quer que tentemos instalar agora? (s/n): " R
    if [ "$R" = "s" ]; then
        if [ "$OS" = "mac" ]; then
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            brew install python3
        else
            sudo apt update && sudo apt install python3 python3-pip -y
        fi
    else
        echo "  Instala Python e corre este script novamente."
        exit 1
    fi
fi

# ---- Flask ----
echo ""
echo "[2/3] A instalar Flask..."
pip3 install flask -q 2>/dev/null || pip install flask -q 2>/dev/null || python3 -m pip install flask -q
if python3 -c "import flask" 2>/dev/null; then
    echo "  [OK] Flask instalado!"
else
    echo "  [ERRO] Falhou. Tenta: sudo pip3 install flask"
    exit 1
fi

# ---- C++ engine ----
echo ""
echo "[3/3] A verificar motor C++..."
if [ -f "ludo_engine.so" ] || [ -f "ludo_engine.dll" ]; then
    echo "  [OK] Motor C++ ja compilado!"
elif command -v g++ &>/dev/null; then
    echo "  A compilar..."
    g++ -O2 -std=c++17 -shared -fPIC -o ludo_engine.so ludo_engine.cpp
    echo "  [OK] Compilado!"
else
    echo "  [AVISO] g++ nao encontrado. Jogo funciona sem ele."
    echo "  Para instalar: sudo apt install g++ (Linux) / xcode-select --install (Mac)"
fi

# ---- Config ----
echo ""
echo "  =========================================="
echo "  CONFIGURACAO"
echo "  =========================================="
echo ""
read -p "  Numero Express da plataforma (Enter=923 456 789): " EXPRESS
[ -z "$EXPRESS" ] && EXPRESS="923 456 789"

read -p "  Chave admin (Enter=ludokz2025): " AKEY
[ -z "$AKEY" ] && AKEY="ludokz2025"

echo ""
echo "  =========================================="
echo "  TUDO PRONTO!"
echo "  =========================================="
echo ""
echo "  Site:           http://localhost:5000"
echo "  Admin:          http://localhost:5000/admin"
echo "  Numero Express: $EXPRESS"
echo "  Chave admin:    $AKEY"
echo ""
echo "  A abrir browser..."

# Abrir browser
sleep 1
if command -v xdg-open &>/dev/null; then xdg-open "http://localhost:5000" &
elif command -v open &>/dev/null; then open "http://localhost:5000" &
fi

echo "  Servidor a correr. Prima Ctrl+C para parar."
echo ""

export PLATFORM_EXPRESS="$EXPRESS"
export ADMIN_KEY="$AKEY"
python3 app.py

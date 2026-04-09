#!/bin/bash
# LudoKz — Arranque automático (Linux/Mac)
set -e
cd "$(dirname "$0")"

echo ""
echo "  ===================================="
echo "    LudoKz | A Iniciar o Jogo..."
echo "  ===================================="
echo ""

# Verificar Python
if ! command -v python3 &>/dev/null; then
    echo "[ERRO] Python3 nao encontrado."
    echo "  Ubuntu/Debian: sudo apt install python3 python3-pip"
    echo "  Mac:           brew install python3"
    exit 1
fi

# Instalar Flask
python3 -c "import flask" 2>/dev/null || {
    echo "  A instalar Flask..."
    pip3 install flask -q
}

# Compilar motor C++
if [ ! -f ludo_engine.so ]; then
    if command -v g++ &>/dev/null; then
        echo "  A compilar motor C++..."
        g++ -O2 -std=c++17 -shared -fPIC -o ludo_engine.so ludo_engine.cpp
        echo "  Motor C++ compilado!"
    else
        echo "  [AVISO] g++ nao encontrado. Instala com:"
        echo "  Ubuntu: sudo apt install g++"
        echo "  Mac:    xcode-select --install"
    fi
fi

# Abrir browser
sleep 1 && {
    if command -v xdg-open &>/dev/null; then
        xdg-open "http://localhost:5000"
    elif command -v open &>/dev/null; then
        open "http://localhost:5000"
    fi
} &

echo ""
echo "  Site: http://localhost:5000"
echo "  Admin: http://localhost:5000/admin"
echo "  Chave Admin: ludokz2025"
echo ""
echo "  Pressiona Ctrl+C para parar."
echo ""

export PLATFORM_EXPRESS="923 456 789"
export ADMIN_KEY="ludokz2025"
python3 app.py

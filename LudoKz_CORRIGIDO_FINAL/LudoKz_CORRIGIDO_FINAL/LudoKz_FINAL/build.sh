#!/bin/bash
# Script de build para o Render
echo "=== LudoKz Build Script ==="

# Instalar dependências Python
pip install -r requirements.txt

# Compilar motor C++ se g++ disponível
if command -v g++ &>/dev/null; then
    echo "A compilar motor C++..."
    g++ -O2 -std=c++17 -shared -fPIC -o ludo_engine.so ludo_engine.cpp
    echo "Motor C++ compilado!"
else
    echo "g++ não encontrado — usando motor Python"
fi

echo "Build concluído!"

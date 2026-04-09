@echo off
title LudoKz - A Iniciar...
echo.
echo  ====================================
echo    LudoKz ^| A Iniciar o Jogo...
echo  ====================================
echo.

:: Verificar Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Python nao encontrado!
    echo.
    echo  Instala Python em: https://python.org/downloads
    echo  Na instalacao, marca "Add Python to PATH"
    echo.
    pause
    exit /b 1
)

:: Instalar Flask se necessario
echo  A verificar Flask...
python -m pip show flask >nul 2>&1
if errorlevel 1 (
    echo  A instalar Flask...
    python -m pip install flask -q
)

:: Compilar motor C++ se necessario
if not exist ludo_engine.dll (
    echo  A compilar motor C++...
    where g++ >nul 2>&1
    if errorlevel 1 (
        echo  [AVISO] g++ nao encontrado. O motor C++ nao sera usado.
        echo  O jogo funciona na mesma mas sem o motor C++ optimizado.
    ) else (
        g++ -O2 -std=c++17 -shared -o ludo_engine.dll ludo_engine.cpp
        echo  Motor C++ compilado!
    )
)

:: Abrir browser automaticamente
echo.
echo  Abrindo o browser...
start "" "http://localhost:5000"

:: Iniciar servidor
echo  Servidor a correr em http://localhost:5000
echo  Fecha esta janela para parar o servidor.
echo.
set PLATFORM_EXPRESS=923 456 789
set ADMIN_KEY=ludokz2025
python app.py
pause

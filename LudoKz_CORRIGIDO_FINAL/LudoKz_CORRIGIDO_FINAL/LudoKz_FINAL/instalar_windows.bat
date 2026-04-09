@echo off
title LudoKz - Instalador
color 0A
echo.
echo  ==========================================
echo    LudoKz ^| Instalador Automatico
echo  ==========================================
echo.

:: ---- Verificar Python ----
echo [1/3] A verificar Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [ERRO] Python nao encontrado!
    echo.
    echo  Solucao:
    echo  1. Vai a: https://python.org/downloads
    echo  2. Clica em "Download Python 3.x.x"
    echo  3. NO INSTALADOR: marca a caixa
    echo     "Add Python to PATH"  ^<-- MUITO IMPORTANTE
    echo  4. Clica "Install Now"
    echo  5. Reinicia o computador
    echo  6. Corre este ficheiro novamente
    echo.
    pause
    start https://python.org/downloads
    exit /b 1
)
python --version
echo  [OK] Python encontrado!
echo.

:: ---- Instalar Flask ----
echo [2/3] A instalar Flask (servidor web)...
python -m pip install flask --quiet --no-warn-script-location
if errorlevel 1 (
    echo  [ERRO] Falhou ao instalar Flask.
    echo  Tenta correr como Administrador.
    pause
    exit /b 1
)
echo  [OK] Flask instalado!
echo.

:: ---- Compilar C++ se possivel ----
echo [3/3] A verificar motor C++...
if exist ludo_engine.dll (
    echo  [OK] Motor C++ ja compilado!
) else (
    where g++ >nul 2>&1
    if not errorlevel 1 (
        echo  A compilar motor C++...
        g++ -O2 -std=c++17 -shared -o ludo_engine.dll ludo_engine.cpp
        echo  [OK] Motor C++ compilado!
    ) else (
        echo  [AVISO] g++ nao encontrado.
        echo  O jogo funciona na mesma com motor Python.
    )
)
echo.

:: ---- Configurar numero Express ----
echo ==========================================
echo  CONFIGURACAO DO NUMERO EXPRESS
echo ==========================================
echo.
set /p EXPRESS=" Numero Express da plataforma (ex: 923456789): "
if "%EXPRESS%"=="" set EXPRESS=923 456 789

set /p ADMINKEY=" Chave admin (Enter para usar padrao): "
if "%ADMINKEY%"=="" set ADMINKEY=ludokz2025

echo.
echo ==========================================
echo  TUDO PRONTO!
echo ==========================================
echo.
echo  Site:          http://localhost:5000
echo  Admin:         http://localhost:5000/admin
echo  Numero Express: %EXPRESS%
echo  Chave admin:   %ADMINKEY%
echo.
echo  A abrir o browser...
timeout /t 2 /nobreak >nul
start "" "http://localhost:5000"

echo  Servidor a correr. NAO FECHES ESTA JANELA.
echo  Para parar: fecha esta janela.
echo.

set PLATFORM_EXPRESS=%EXPRESS%
set ADMIN_KEY=%ADMINKEY%
python app.py
pause

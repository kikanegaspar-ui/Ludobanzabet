@echo off
cd /d "%~dp0"
title LudoKz - Servidor
color 0A
cls
echo.
echo  ==========================================
echo    LudoKz ^| Servidor do Jogo
echo  ==========================================
echo.
echo  Site:   http://localhost:5000
echo  Admin:  http://localhost:5000/admin
echo.
echo  NAO feches esta janela!
echo  Para parar: prime Ctrl+C
echo  ==========================================
echo.

set PLATFORM_EXPRESS=923 456 789
set ADMIN_KEY=ludokz2025
set PORT=5000

python app.py
pause

@echo off
setlocal
title Tekuchi Manager

:: --- SETTINGS ---
set "SERVER_DIR=%~dp0server\comparer"
set "FRONTEND_DIR=%~dp0"
set "LOG_DIR=%~dp0logs"

:init
cls
echo --- Tekuchi Dev Manager ---
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

:: 1. AUTO-INSTALL DEPENDENCIES
echo [DEP] Installing/Updating Python dependencies...
python -m pip install -r "%SERVER_DIR%\requirements.txt" >nul 2>&1
echo [DEP] Installing/Updating Node dependencies...
call npm install --prefix "%FRONTEND_DIR%" --no-audit --no-fund >nul 2>&1

:: 2. CLEANUP OLD PROCESSES
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
timeout /t 1 >nul

:: 3. LAUNCH SERVICES IN BACKGROUND
echo [START] Launching Backend...
start /b "API" cmd /c "cd /d "%SERVER_DIR%" && python -m uvicorn main:app --host 0.0.0.0 --port 8000 >> "%LOG_DIR%\api.log" 2>&1"
echo [START] Launching Frontend...
start /b "Next" cmd /c "cd /d "%FRONTEND_DIR%" && npm run dev >> "%LOG_DIR%\frontend.log" 2>&1"

echo -------------------------------------------------------
echo SERVICES ACTIVE. API: :8000 | Frontend: :3000
echo -------------------------------------------------------

:monitor
echo.
set "cmd="
set /p cmd="Enter Command [ LOGS | FLOGS | RESTART | STOP ]: "

if /i "%cmd%"=="LOGS"    goto view_logs
if /i "%cmd%"=="FLOGS"   goto view_flogs
if /i "%cmd%"=="RESTART" goto init
if /i "%cmd%"=="STOP"    goto do_stop
goto monitor

:view_logs
start powershell -command "Get-Content '%LOG_DIR%\api.log' -Wait"
goto monitor

:view_flogs
start powershell -command "Get-Content '%LOG_DIR%\frontend.log' -Wait"
goto monitor

:do_stop
echo [STOP] Shutting down all processes...
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
exit
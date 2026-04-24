@echo off
setlocal
title Tekuchi Manager

:: --- SETTINGS ---
set "SERVER_DIR=%~dp0server\comparer"
set "FRONTEND_DIR=%~dp0"
set "LOG_DIR=%~dp0logs"

:init
cls
echo =======================================================
echo               TEKUCHI DEV MANAGER
echo =======================================================
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

:: 1. AUTO-INSTALL DEPENDENCIES
echo [DEP] Checking Python dependencies...
python -m pip install -r "%SERVER_DIR%\requirements.txt" >nul 2>&1
echo [DEP] Checking Node dependencies...
call npm install --prefix "%FRONTEND_DIR%" --no-audit --no-fund >nul 2>&1

:: 2. CLEANUP OLD PROCESSES
echo [CLEAN] Clearing existing processes...
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
timeout /t 1 >nul

:: 3. LAUNCH SERVICES
echo [START] Launching Backend (Port 8000)...
start /b "API" cmd /c "cd /d "%SERVER_DIR%" && python -m uvicorn main:app --host 0.0.0.0 --port 8000 >> "%LOG_DIR%\api.log" 2>&1"

echo [START] Launching Frontend (Port 3000)...
start /b "Next" cmd /c "cd /d "%FRONTEND_DIR%" && npm run dev >> "%LOG_DIR%\frontend.log" 2>&1"

echo -------------------------------------------------------
echo SERVICES ACTIVE. 
echo - API: http://localhost:8000
echo - Frontend: http://localhost:3000
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
echo Opening API logs...
start powershell -command "Get-Content '%LOG_DIR%\api.log' -Wait"
goto monitor

:view_flogs
echo Opening Frontend logs...
start powershell -command "Get-Content '%LOG_DIR%\frontend.log' -Wait"
goto monitor

:do_stop
echo [STOP] Shutting down all processes...
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
echo Press any key to exit.
pause >nul
exit
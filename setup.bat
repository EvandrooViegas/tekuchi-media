@echo off
setlocal
title Tekuchi Suite - Dev Manager

:: 1. SETTINGS
set PYTHON=python
set LOG_DIR=%~dp0logs
set SERVER_DIR=%~dp0server\comparer
set FRONTEND_DIR=%~dp0

echo --- Tekuchi Suite: Dev Manager ---
echo --------------------------------------------------------

:: 2. PREREQUISITE CHECKS
echo [CHECK] Verifying environment...

%PYTHON% --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python and check 'Add to PATH'.
    pause
    exit
)

call npm -v >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js/NPM not found. Please install Node.js from nodejs.org.
    pause
    exit
)

:: 3. CLEANUP & PREP
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
echo [AUTO] Cleaning old processes...
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
timeout /t 1 >nul

:: Clear log files
copy /y nul "%LOG_DIR%\api.log" >nul 2>&1
copy /y nul "%LOG_DIR%\frontend.log" >nul 2>&1

:: 4. LAUNCH SERVICES
echo [AUTO] Starting Backend (API)...
:: Runs pip install then launches Uvicorn
start /b "Tekuchi_API" cmd /c "cd /d "%SERVER_DIR%" && %PYTHON% -m pip install -r requirements.txt >> "%LOG_DIR%\api.log" 2>&1 && %PYTHON% -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload >> "%LOG_DIR%\api.log" 2>&1"

echo [AUTO] Starting Frontend (Next.js)...
:: Runs npm install if node_modules is missing, then launches dev server
start /b "Tekuchi_Frontend" cmd /c "cd /d "%FRONTEND_DIR%" && (if not exist node_modules npm install) && npm run dev >> "%LOG_DIR%\frontend.log" 2>&1"

echo --------------------------------------------------------
echo [SUCCESS] Services are launching in the background.
echo API: http://localhost:8000
echo Frontend: http://localhost:3000
echo --------------------------------------------------------

:monitor
echo.
echo COMMANDS: [ LOGS | FLOGS | RESTART | STOP ]
set /p userinput="Enter Command: "

if /i "%userinput%"=="LOGS"    goto do_logs
if /i "%userinput%"=="FLOGS"   goto do_flogs
if /i "%userinput%"=="RESTART" goto do_restart
if /i "%userinput%"=="STOP"    goto do_stop
goto do_unknown

:do_logs
echo Opening API logs...
start "API Logs" powershell -command "if(Test-Path '%LOG_DIR%\api.log'){ Get-Content '%LOG_DIR%\api.log' -Wait } else { Write-Host 'Log file not created yet.' }"
goto monitor

:do_flogs
echo Opening Frontend logs...
start "Frontend Logs" powershell -command "if(Test-Path '%LOG_DIR%\frontend.log'){ Get-Content '%LOG_DIR%\frontend.log' -Wait } else { Write-Host 'Log file not created yet.' }"
goto monitor

:do_restart
echo Restarting all services...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im python.exe >nul 2>&1
timeout /t 2 >nul
goto monitor

:do_stop
echo Stopping all services...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im python.exe >nul 2>&1
echo Done. Goodbye.
timeout /t 2 >nul
exit

:do_unknown
echo Unknown command. Use: LOGS, FLOGS, RESTART, or STOP.
goto monitor
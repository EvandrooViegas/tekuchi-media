@echo off
setlocal
title Tekuchi Manager

:: --- SETTINGS ---
set "BASE_DIR=%~dp0"
set "SERVER_DIR=%BASE_DIR%server\comparer"
set "LOG_DIR=%BASE_DIR%logs"

:init
cls
echo =======================================================
echo               TEKUCHI DEV MANAGER
echo =======================================================
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

:: 1. AUTO-INSTALL PYTHON DEPENDENCIES
echo [DEP] Checking Python dependencies...
if not exist "%SERVER_DIR%\requirements.txt" goto skip_python
python -m pip install -r "%SERVER_DIR%\requirements.txt" >nul 2>&1
:skip_python

:: 2. AUTO-INSTALL NODE DEPENDENCIES
echo [DEP] Installing Node dependencies...
cd /d "%BASE_DIR%"
if not exist "package.json" goto err_pkg

echo Running NPM Install... Please wait.
call npm install
goto check_next

:err_pkg
echo [ERROR] package.json NOT FOUND in %BASE_DIR%
pause
goto monitor

:check_next
:: 3. STRICT VERIFICATION
echo [CHECK] Verifying installation...
if exist "%BASE_DIR%node_modules\.bin\next.cmd" goto do_cleanup
echo.
echo =======================================================
echo [FATAL ERROR] The 'next' executable is missing!
echo NPM failed to install your dependencies properly.
echo Please scroll up and look at the NPM error messages.
echo =======================================================
pause
goto monitor

:do_cleanup
:: 4. CLEANUP OLD PROCESSES
echo [CLEAN] Clearing existing processes...
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
timeout /t 1 >nul

:: 5. LAUNCH SERVICES
echo [START] Launching Backend (Port 8000)...
start /b "API" /D "%SERVER_DIR%" cmd /c "python -m uvicorn main:app --host 0.0.0.0 --port 8000 >> "%LOG_DIR%\api.log" 2>&1"

echo [START] Launching Frontend (Port 3000)...
start /b "Next" /D "%BASE_DIR%" cmd /c "call npm run dev >> "%LOG_DIR%\frontend.log" 2>&1"

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
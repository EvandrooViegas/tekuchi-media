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
if exist "%SERVER_DIR%\requirements.txt" (
    python -m pip install -r "%SERVER_DIR%\requirements.txt" >nul 2>&1
) else (
    echo [WARN] Python requirements.txt not found at %SERVER_DIR%
)

:: 2. AUTO-INSTALL NODE DEPENDENCIES
echo [DEP] Installing Node dependencies...
cd /d "%BASE_DIR%"
if exist "package.json" (
    echo Running NPM Install... Please wait.
    :: We removed >nul completely. You will now see the installation happen!
    call npm install
) else (
    echo [ERROR] package.json NOT FOUND in %BASE_DIR%
    pause
    goto monitor
)

:: 3. STRICT VERIFICATION - GUARANTEE NEXT.JS EXISTS
echo [CHECK] Verifying installation...
if not exist "%BASE_DIR%node_modules\.bin\next.cmd" (
    echo.
    echo =======================================================
    echo [FATAL ERROR] The 'next' executable is missing!
    echo NPM failed to install your dependencies properly.
    echo Please scroll up and look at the NPM error messages.
    echo =======================================================
    pause
    goto monitor
)

:: 4. CLEANUP OLD PROCESSES
echo [CLEAN] Clearing existing processes...
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
timeout /t 1 >nul

:: 5. LAUNCH SERVICES
echo [START] Launching Backend (Port 8000)...
start /b "API" cmd /c "cd /d "%SERVER_DIR%" && python -m uvicorn main:app --host 0.0.0.0 --port 8000 >> "%LOG_DIR%\api.log" 2>&1"

echo [START] Launching Frontend (Port 3000)...
start /b "Next" cmd /c "cd /d "%BASE_DIR%" && call npm run dev >> "%LOG_DIR%\frontend.log" 2>&1"

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
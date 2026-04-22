@echo off
setlocal enabledelayedexpansion
title Tekuchi Suite: Dev Manager

:: 1. SETTINGS
set "PYTHON=python"
set "LOG_DIR=%~dp0logs"
set "SERVER_DIR=%~dp0server\comparer"
set "FRONTEND_DIR=%~dp0"

:init_services
cls
echo --- Tekuchi Suite: Dev Manager ---
echo --------------------------------------------------------

:: 2. AUTO-INSTALL DEPENDENCIES
echo [CHECK] Updating Python & Node dependencies...
%PYTHON% -m pip install -r "%SERVER_DIR%\requirements.txt" >nul 2>&1
call npm install --prefix "%FRONTEND_DIR%" --no-audit --no-fund >nul 2>&1

:: 3. CLEANUP OLD PROCESSES
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
echo [AUTO] Resetting processes...
taskkill /f /im python.exe >nul 2>&1
taskkill /f /im node.exe >nul 2>&1
timeout /t 1 >nul

:: 4. LAUNCH SERVICES IN BACKGROUND
:: Using 'start /b' is critical here so they don't take over this window
echo [AUTO] Starting Backend (API)...
start /b "API" cmd /c "cd /d "%SERVER_DIR%" && %PYTHON% -m uvicorn main:app --host 0.0.0.0 --port 8000 >> "%LOG_DIR%\api.log" 2>&1"

echo [AUTO] Starting Frontend (Next.js)...
start /b "Next" cmd /c "cd /d "%FRONTEND_DIR%" && npm run dev >> "%LOG_DIR%\frontend.log" 2>&1"

echo --------------------------------------------------------
echo [SUCCESS] Services are running in background.
echo API: http://localhost:8000 | Frontend: http://localhost:3000
echo --------------------------------------------------------

:monitor
echo.
set "choice="
:: This prompt keeps the window alive and waits for your input
set /p choice="Enter Command [ LOGS | FLOGS | RESTART | STOP ]: "

if /i "%choice%"=="LOGS"    goto do_logs
if /i "%choice%"=="FLOGS"   goto do_flogs
if /i "%choice%"=="RESTART" goto do_restart
if /i "%choice%"=="STOP"    goto do_stop
echo Invalid input.
goto monitor

:do_logs
start powershell -command "Get-Content '%LOG_DIR%\api.log' -Wait"
goto monitor

:do_flogs
start powershell -command "Get-Content '%LOG_DIR%\frontend.log' -Wait"
goto monitor

:do_restart
goto init_services

:do_stop
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im python.exe >nul 2>&1
exit
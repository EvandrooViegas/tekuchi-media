@echo off
setlocal enabledelayedexpansion
title Tekuchi - Auto Update Watcher

:: --- CONFIGURATION ---
set "BRANCH=master"
cd /d "%~dp0"

echo [INIT] System starting. Performing initial sync...
:: Force a sync on startup to ensure we are current
git fetch origin %BRANCH%
git reset --hard origin/%BRANCH%

:: Launch the Manager immediately
start "Tekuchi Manager" cmd /c "manager.bat"

:loop
cls
echo =======================================================
echo  TEKUCHI MEDIA - AUTO PULL WATCHER
echo  Status: Monitoring GitHub... | Branch: %BRANCH%
echo  Last Check: %time%
echo =======================================================

:: Check for remote changes
git fetch origin %BRANCH% >nul 2>&1

for /f %%i in ('git rev-parse HEAD') do set LOCAL_HASH=%%i
for /f %%j in ('git rev-parse origin/%BRANCH%') do set REMOTE_HASH=%%j

if "%LOCAL_HASH%" NEQ "%REMOTE_HASH%" (
    echo [UPDATE] New version detected!
    
    :: Kill the active manager window
    taskkill /fi "windowtitle eq Tekuchi Manager" /f >nul 2>&1
    
    :: Clean lock files and sync
    if exist ".git\index.lock" del /f /q ".git\index.lock"
    git reset --hard origin/%BRANCH%
    
    echo [RESTART] Launching updated version...
    timeout /t 2 >nul
    start "Tekuchi Manager" cmd /c "manager.bat"
)

:: Check every 60 seconds
timeout /t 60 >nul
goto loop
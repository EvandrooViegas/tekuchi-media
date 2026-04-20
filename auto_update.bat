@echo off
setlocal enabledelayedexpansion
title Tekuchi - Auto Pull Watcher

:: Ensure we are in the repository folder
cd /d "%~dp0"
set BRANCH=master

:: --- FIRST RUN ---
echo [INIT] Server started. Syncing and performing initial launch...
git fetch origin %BRANCH%
git add .
git reset --hard origin/%BRANCH%

:: Start the manager in a new window so this script can continue watching
start "Tekuchi Suite - Dev Manager" cmd /c "setup.bat"

:loop
cls
echo =======================================================
echo  TEKUCHI MEDIA - 24/7 WATCHER
echo  Status: Monitoring GitHub...
echo  Branch: %BRANCH%
echo  Last Check: %time%
echo =======================================================

:: Fetch latest metadata from GitHub
git fetch origin %BRANCH% >nul 2>&1

:: Compare local hash to remote hash
for /f %%i in ('git rev-parse HEAD') do set LOCAL_HASH=%%i
for /f %%j in ('git rev-parse origin/%BRANCH%') do set REMOTE_HASH=%%j

echo Local Hash:  %LOCAL_HASH:~0,7%
echo Remote Hash: %REMOTE_HASH:~0,7%

if "%LOCAL_HASH%" NEQ "%REMOTE_HASH%" (
    echo.
    echo [UPDATE] New version found on GitHub!
    
    :: 1. Kill the specific Manager window
    echo [KILL] Closing old Manager window...
    taskkill /fi "windowtitle eq Tekuchi Suite - Dev Manager" /f >nul 2>&1
    
    :: 2. Force local sync (The "Nuclear Option" to avoid conflicts)
    echo [SYNC] Updating files to match origin/%BRANCH%...
    git add .
    git reset --hard origin/%BRANCH%
    
    :: 3. Launch the new Manager
    echo [RESTART] Launching updated setup.bat...
    timeout /t 2 >nul
    start "Tekuchi Suite - Dev Manager" cmd /c "setup.bat"
) else (
    echo [IDLE] System is up to date.
)

:: Wait 30 seconds before checking again
timeout /t 30 >nul
goto loop
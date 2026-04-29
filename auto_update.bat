@echo off
setlocal enabledelayedexpansion
title Tekuchi Auto-Updater

:: --- CONFIGURATION ---
set "REPO_URL=https://github.com/EvandrooViegas/tekuchi-media"
set "BRANCH=master"
set "CHECK_INTERVAL=60"

:check_loop
cls
echo [%time%] Checking for updates on %BRANCH%...

:: Fetch latest info from remote
git fetch origin %BRANCH% >nul 2>&1

:: Compare local HEAD with origin/BRANCH
for /f %%i in ('git rev-parse HEAD') do set LOCAL_HASH=%%i
for /f %%i in ('git rev-parse origin/%BRANCH%') do set REMOTE_HASH=%%i

if "%LOCAL_HASH%"=="%REMOTE_HASH%" (
    echo [OK] Already up to date.
) else (
    echo [UPDATE] New version detected!
    
    echo [1/4] Stopping application...
    taskkill /FI "WINDOWTITLE eq Tekuchi Manager" /T /F >nul 2>&1
    taskkill /f /im python.exe >nul 2>&1
    taskkill /f /im node.exe >nul 2>&1

    echo [2/4] Cleaning local files and pulling...
    :: This removes all local changes and pulls the fresh version
    git reset --hard origin/%BRANCH%
    git clean -fd

    echo [3/4] Update complete.
    echo [4/4] Restarting Manager...
    start "Tekuchi Manager" cmd /c "manager.bat"
)

echo [%time%] Next check in %CHECK_INTERVAL% seconds.
timeout /t %CHECK_INTERVAL% >nul
goto check_loop
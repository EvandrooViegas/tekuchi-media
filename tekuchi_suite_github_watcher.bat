@echo off
setlocal enabledelayedexpansion
title Tekuchi - Auto Pull Watcher

cd /d "%~dp0"

:: Set branch manually to avoid any detection errors
set BRANCH=master

:loop
cls
echo =======================================================
echo  TEKUCHI MEDIA - AUTO DEPLOYER
echo  Branch: %BRANCH%
echo  Last Check: %time%
echo =======================================================

echo [1/3] Fetching from GitHub...
git fetch origin %BRANCH%

:: Get the ID of the local code
for /f %%i in ('git rev-parse HEAD') do set LOCAL_HASH=%%i
:: Get the ID of the code on GitHub
for /f %%j in ('git rev-parse origin/%BRANCH%') do set REMOTE_HASH=%%j

echo Local:  %LOCAL_HASH:~0,7%
echo Remote: %REMOTE_HASH:~0,7%

if "%LOCAL_HASH%" NEQ "%REMOTE_HASH%" (
    echo.
    echo [2/3] UPDATE DETECTED!
    echo [3/3] Forcing local sync...
    
    :: Add everything and reset to ensure no local file blocks the update
    git add .
    git reset --hard origin/%BRANCH%
    
    echo [SUCCESS] Code updated.
    echo [LAUNCH] Starting setup.bat...
    
    :: Use 'start' to run your manager
    start "Tekuchi Suite - Dev Manager" cmd /c "setup.bat"
) else (
    echo [IDLE] Local and Remote are identical.
)

:: Check every 30 seconds for faster updates
timeout /t 30 >nul
goto loop
@echo off
rem DOC_ID=sync_from_github
setlocal
cd /d "%~dp0"
if exist "scripts\update_batch_docs.ps1" powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\update_batch_docs.ps1" >nul 2>nul

echo ========================================
echo   Sync latest content from GitHub
echo ========================================
echo.

where git >nul 2>nul
if errorlevel 1 goto :no_git

if not exist ".git" goto :not_repo

git diff --quiet
if errorlevel 1 goto :local_changes
git diff --cached --quiet
if errorlevel 1 goto :local_changes

echo Connecting to GitHub...
git pull --ff-only origin main
if errorlevel 1 goto :pull_failed

echo.
echo [OK] GitHub content is synchronized.
git log -1 --format="Latest: %%h  %%s  %%cd" --date=short
echo.
pause
exit /b 0

:no_git
echo [ERROR] Git for Windows is not installed or is not in PATH.
goto :failed

:not_repo
echo [ERROR] This batch file is not inside a Git repository.
goto :failed

:local_changes
echo [STOPPED] Tracked files have uncommitted local changes.
echo Synchronization was stopped to protect the local changes.
echo.
git status --short
goto :failed

:pull_failed
echo.
echo [ERROR] Synchronization failed. Check the network and GitHub access.

:failed
echo.
pause
exit /b 1

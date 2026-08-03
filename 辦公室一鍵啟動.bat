@echo off
rem DOC_ID=office_one_click
chcp 65001 >nul
setlocal EnableExtensions

set "REPO_URL=https://github.com/wushinhuei/groundwater-well-management.git"
set "PROJECT_NAME=groundwater-well-management"

where git.exe >nul 2>nul
if errorlevel 1 goto :no_git

where node.exe >nul 2>nul
if errorlevel 1 goto :no_node

where npm.cmd >nul 2>nul
if errorlevel 1 goto :no_node

if exist "%~dp0.git\" (
  set "PROJECT_DIR=%~dp0"
) else (
  set "PROJECT_DIR=%~dp0%PROJECT_NAME%"
)

if /i "%~1"=="--check" goto :check_only

echo ========================================
echo   Groundwater Well Management
echo   Office One-click Setup and Start
echo ========================================
echo.

if not exist "%PROJECT_DIR%\.git\" goto :clone_project
goto :update_project

:clone_project
if exist "%PROJECT_DIR%\" (
  echo [STOPPED] %PROJECT_DIR%
  echo This folder exists but is not a Git repository. Rename it and try again.
  goto :failed
)

echo First run: cloning the project from GitHub...
git clone "%REPO_URL%" "%PROJECT_DIR%"
if errorlevel 1 goto :clone_failed
goto :prepare_project

:update_project
cd /d "%PROJECT_DIR%"
if errorlevel 1 goto :cd_failed

set "HAS_CHANGES="
for /f "delims=" %%G in ('git status --porcelain') do set "HAS_CHANGES=1"
if defined HAS_CHANGES (
  echo Local changes detected. GitHub update is skipped to protect them.
) else (
  echo Updating to the latest GitHub version...
  git pull --ff-only origin main
  if errorlevel 1 goto :pull_failed
)

:prepare_project
cd /d "%PROJECT_DIR%"
if errorlevel 1 goto :cd_failed
if exist "scripts\update_batch_docs.ps1" powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\update_batch_docs.ps1" >nul 2>nul

if not exist "docs\data\wells.json" goto :missing_data
if not exist "docs\data\attachments\" goto :missing_data

echo Syncing the published web interface...
copy /y "docs\index.html" "public\index.html" >nul
copy /y "docs\styles.css" "public\styles.css" >nul
copy /y "docs\app.js" "public\app.js" >nul
if errorlevel 1 goto :copy_failed

echo Syncing all well records and attachments...
if not exist "data\" mkdir "data"
if not exist "data\attachments\" mkdir "data\attachments"
copy /y "docs\data\wells.json" "data\wells.json" >nul
if errorlevel 1 goto :copy_failed
robocopy "docs\data\attachments" "data\attachments" /E /XO /R:2 /W:1 /NFL /NDL /NJH /NJS >nul
if errorlevel 8 goto :copy_failed

for /f %%C in ('powershell -NoProfile -Command "(Get-Content -Raw -Encoding UTF8 'data\wells.json' ^| ConvertFrom-Json).Count"') do set "WELL_COUNT=%%C"

echo.
echo [READY] %WELL_COUNT% well records are available.
echo URL: http://localhost:4173/
echo.
echo The server will run in another window. Close that window to stop it.

start "Groundwater Server" cmd /k "cd /d ""%PROJECT_DIR%"" && npm.cmd start"
timeout /t 2 /nobreak >nul
start "" "http://localhost:4173/"
exit /b 0

:check_only
echo [OK] Git, Node.js and npm are installed.
echo Batch location: %~dp0
echo Project location: %PROJECT_DIR%
exit /b 0

:no_git
echo [ERROR] Git for Windows was not found.
echo Install it from: https://git-scm.com/download/win
goto :failed

:no_node
echo [ERROR] Node.js was not found.
echo Install Node.js 20 or newer from: https://nodejs.org/
goto :failed

:clone_failed
echo [ERROR] Could not clone the project. Check the network connection.
goto :failed

:pull_failed
echo [ERROR] Could not update the project. Existing files were not deleted.
goto :failed

:cd_failed
echo [ERROR] Could not open the project folder: %PROJECT_DIR%
goto :failed

:missing_data
echo [ERROR] Complete well data was not found in the GitHub project.
goto :failed

:copy_failed
echo [ERROR] Failed to synchronize the website or well data.

:failed
echo.
pause
exit /b 1

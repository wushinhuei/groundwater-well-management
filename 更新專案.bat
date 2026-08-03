@echo off
rem DOC_ID=update_project
chcp 65001 >nul
setlocal

cd /d "%~dp0"
if errorlevel 1 goto :cd_failed
if exist "scripts\update_batch_docs.ps1" powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\update_batch_docs.ps1" >nul 2>nul

echo 正在從 GitHub 更新專案，請稍候...
git pull --rebase
if errorlevel 1 goto :pull_failed

echo.
echo [成功] 專案已更新為 GitHub 上的最新版本。
goto :end

:cd_failed
echo.
echo [失敗] 無法切換到專案資料夾。
goto :end

:pull_failed
echo.
echo [失敗] 更新專案時發生錯誤，請檢查上方訊息。

:end
echo.
pause
endlocal

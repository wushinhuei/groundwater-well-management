@echo off
rem DOC_ID=sync_to_github
chcp 65001 >nul
setlocal

cd /d "%~dp0"
if errorlevel 1 goto :cd_failed
if exist "scripts\update_batch_docs.ps1" powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\update_batch_docs.ps1" >nul 2>nul

echo 正在檢查本機修改...
git add -A
if errorlevel 1 goto :add_failed

git diff --cached --quiet
if errorlevel 1 goto :commit_changes

echo 沒有需要提交的新修改。
goto :pull_latest

:commit_changes
for /f "usebackq delims=" %%T in (`powershell -NoProfile -Command "Get-Date -Format 'yyyy-MM-dd HH:mm:ss'"`) do set "SYNC_TIME=%%T"
git commit -m "自動同步 %SYNC_TIME%"
if errorlevel 1 goto :commit_failed

:pull_latest
echo.
echo 正在取得 GitHub 最新版本...
git pull --rebase
if errorlevel 1 goto :pull_failed

echo.
echo 正在上傳到 GitHub...
git push
if errorlevel 1 goto :push_failed

echo.
echo [成功] 本機修改已同步到 GitHub。
goto :end

:cd_failed
echo.
echo [失敗] 無法切換到專案資料夾。
goto :end

:add_failed
echo.
echo [失敗] 無法加入本機修改，請檢查上方訊息。
goto :end

:commit_failed
echo.
echo [失敗] 無法建立 Git 提交，請檢查上方訊息。
goto :end

:pull_failed
echo.
echo [失敗] 無法取得 GitHub 最新版本。請先解決上方顯示的問題，再重新執行。
goto :end

:push_failed
echo.
echo [失敗] 無法上傳到 GitHub，請檢查網路、權限或上方訊息。

:end
echo.
pause
endlocal

@echo off
rem DOC_ID=open_local_system
chcp 65001 > nul
cd /d "%~dp0"
if exist "scripts\update_batch_docs.ps1" powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\update_batch_docs.ps1" >nul 2>nul
where node > nul 2>&1
if errorlevel 1 (
  echo 找不到 Node.js，請先安裝 Node.js 20 以上版本。
  pause
  exit /b 1
)
start "" "http://localhost:4173"
echo 正在啟動臺中管理處地下水井管理系統...
echo 關閉此視窗即可停止網站。
npm start
pause

@echo off
setlocal
if not exist "%~dp0Manual-Update.ps1" (
  echo Please extract the complete Groundwater-PC package first.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0Manual-Update.ps1"
set "UPDATE_RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %UPDATE_RESULT%

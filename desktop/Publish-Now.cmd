@echo off
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0Run.ps1" -Mode publish
pause

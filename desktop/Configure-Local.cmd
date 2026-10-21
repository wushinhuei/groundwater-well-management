@echo off
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0Configure-Local.ps1"
pause

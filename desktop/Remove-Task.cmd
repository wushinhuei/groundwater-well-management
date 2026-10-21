@echo off
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0Remove-Task.ps1"
pause

@echo off
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (python start_dashboard.py %*) else (py -3 start_dashboard.py %*)
pause

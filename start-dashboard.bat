@echo off
cd /d "%~dp0"

REM --- start dashboard (server + browser) and close server when window exits ---
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-dashboard.ps1"

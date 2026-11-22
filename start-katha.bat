@echo off
title Katha Studio
cd /d "%~dp0"
if not exist "node_modules" goto setup
if not exist "backend\.venv\Scripts\python.exe" goto setup
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\start.ps1"
goto end
:setup
echo Katha Studio is not set up yet. Running setup...
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\setup.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\start.ps1"
:end

@echo off
setlocal
title CampusWay Runner
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_project.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
    echo.
    echo CampusWay launcher failed with exit code %EXIT_CODE%.
    pause
)
exit /b %EXIT_CODE%

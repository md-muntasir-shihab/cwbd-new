@echo off
setlocal
title CampusWay One-Click Setup and Run

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_and_run_project.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo CampusWay one-click setup failed with exit code %EXIT_CODE%.
    echo Please scroll up and follow the error message.
    pause
)

exit /b %EXIT_CODE%


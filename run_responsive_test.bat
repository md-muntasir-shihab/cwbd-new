@echo off
setlocal enabledelayedexpansion

echo ============================================
echo CampusWay Responsive Design Test Launcher
echo ============================================
echo.

REM Get the directory where this script is located
set "ROOT_DIR=%~dp0"
set "BACKEND_DIR=%ROOT_DIR%backend"
set "FRONTEND_DIR=%ROOT_DIR%frontend"

REM Check if frontend is already running on port 5176
echo Checking if frontend dev server is running on port 5176...
netstat -ano | findstr :5176 > nul
if %errorlevel% equ 0 (
    echo Frontend server is already running on port 5176
) else (
    echo Starting Frontend Server on port 5176...
    cd /d "%FRONTEND_DIR%"
    start "CampusWay Frontend - Port 5176" cmd /k "npm run dev -- --host 127.0.0.1 --port 5176"
    echo Waiting 10 seconds for frontend server to initialize...
    timeout /t 10 /nobreak
)

echo.
echo Running Responsive Design Test Suite...
echo ============================================
echo.

cd /d "%ROOT_DIR%"
node responsive-design-test.mjs

echo.
echo ============================================
echo Test execution completed
echo ============================================
echo.
pause

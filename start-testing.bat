@echo off
REM Start CampusWay servers for testing
setlocal enabledelayedexpansion

echo Starting CampusWay Backend...
cd /d "F:\CampusWay\CampusWay\backend"
start "" cmd /k "set PORT=5003 && npm run dev"

echo Waiting for backend to start...
timeout /t 5 /nobreak

echo Starting CampusWay Frontend...
cd /d "F:\CampusWay\CampusWay\frontend"
start "" cmd /k "npm run dev -- --host 127.0.0.1 --port 5175"

echo Servers starting...
timeout /t 3 /nobreak
echo Ready for testing at http://localhost:5175

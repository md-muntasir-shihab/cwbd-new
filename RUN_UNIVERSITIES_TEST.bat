@echo off
echo ==========================================
echo CampusWay Universities Module Test Suite
echo ==========================================
echo.

REM Check if frontend dev server is running
echo Checking if frontend dev server is running on port 5175...
curl -s http://localhost:5175 > nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Frontend dev server is not running!
    echo.
    echo Please start the frontend server first:
    echo   cd frontend
    echo   npm run dev
    echo.
    pause
    exit /b 1
)

echo ✓ Frontend server is running
echo.

REM Check if Puppeteer is installed
echo Checking if Puppeteer is installed...
if not exist "frontend\node_modules\puppeteer" (
    echo.
    echo Puppeteer not found. Installing...
    cd frontend
    call npm install puppeteer
    cd ..
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install Puppeteer
        pause
        exit /b 1
    )
    echo ✓ Puppeteer installed successfully
) else (
    echo ✓ Puppeteer is installed
)
echo.

REM Run the test script
echo Starting test suite...
echo ==========================================
echo.
node test-universities-comprehensive.mjs

echo.
echo ==========================================
echo Test suite completed!
echo.
echo Check the following:
echo   - Report: phase3-universities-test-report.md
echo   - Screenshots: universities-test-screenshots\
echo ==========================================
echo.
pause

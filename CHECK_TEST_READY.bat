@echo off
echo ==========================================
echo CampusWay Universities Test - Pre-Flight Check
echo ==========================================
echo.

echo Checking prerequisites...
echo.

REM Check 1: Node.js
echo [1/4] Checking Node.js installation...
node --version > nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ✗ Node.js is not installed or not in PATH
    echo   Please install Node.js from https://nodejs.org/
    set HAS_ERROR=1
) else (
    for /f "delims=" %%i in ('node --version') do set NODE_VERSION=%%i
    echo ✓ Node.js installed: %NODE_VERSION%
)
echo.

REM Check 2: Frontend directory
echo [2/4] Checking frontend directory...
if exist "frontend" (
    echo ✓ Frontend directory exists
) else (
    echo ✗ Frontend directory not found
    set HAS_ERROR=1
)
echo.

REM Check 3: Frontend dependencies
echo [3/4] Checking frontend dependencies...
if exist "frontend\node_modules" (
    echo ✓ Frontend node_modules exists
    if exist "frontend\node_modules\puppeteer" (
        echo ✓ Puppeteer is installed
    ) else (
        echo ⚠ Puppeteer not found (will be installed when running tests)
    )
) else (
    echo ⚠ Frontend dependencies not installed
    echo   Run: cd frontend ^&^& npm install
)
echo.

REM Check 4: Test script
echo [4/4] Checking test script...
if exist "test-universities-comprehensive.mjs" (
    echo ✓ Test script found
) else (
    echo ✗ Test script not found
    set HAS_ERROR=1
)
echo.

REM Check 5: Frontend server (optional)
echo [Bonus] Checking if frontend server is running...
curl -s http://localhost:5175 > nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ⚠ Frontend server not running on port 5175
    echo   Start it with: cd frontend ^&^& npm run dev
) else (
    echo ✓ Frontend server is running on port 5175
    echo   Ready to run tests!
)
echo.

echo ==========================================
if defined HAS_ERROR (
    echo Status: ✗ Prerequisites NOT met
    echo Please fix the errors above before running tests
) else (
    echo Status: ✓ Ready to run tests!
    echo.
    echo To start testing:
    echo   1. Make sure frontend server is running
    echo   2. Run: RUN_UNIVERSITIES_TEST.bat
)
echo ==========================================
echo.
pause

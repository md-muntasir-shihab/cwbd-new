@echo off
REM ==========================================
REM CampusWay Backend Security Tests Runner
REM ==========================================
setlocal enabledelayedexpansion
cd /d "F:\CampusWay\CampusWay\backend"

echo.
echo ==========================================
echo CampusWay Backend Security Tests
echo ==========================================
echo.
echo Test execution started at: %date% %time%
echo.

REM Check if Node.js is installed
echo [PRE-FLIGHT] Checking prerequisites...
node --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
for /f "delims=" %%i in ('node --version') do (
    echo [OK] Node.js: %%i
)

npm --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm is not installed
    pause
    exit /b 1
)
for /f "delims=" %%i in ('npm --version') do (
    echo [OK] npm: %%i
)

echo.
echo ==========================================
echo TEST SUITE 1: Team Defaults Security
echo ==========================================
echo.
echo Running: npm run test:team:defaults
echo.
call npm run test:team:defaults
set DEFAULTS_RESULT=%ERRORLEVEL%
if %DEFAULTS_RESULT% EQU 0 (
    echo [PASS] Team Defaults Tests
) else (
    echo [FAIL] Team Defaults Tests - Exit Code: %DEFAULTS_RESULT%
)
echo.
echo ==========================================
echo TEST SUITE 2: Team API Security
echo ==========================================
echo.
echo Running: npm run test:team:api
echo.
call npm run test:team:api
set TEAM_API_RESULT=%ERRORLEVEL%
if %TEAM_API_RESULT% EQU 0 (
    echo [PASS] Team API Tests
) else (
    echo [FAIL] Team API Tests - Exit Code: %TEAM_API_RESULT%
)
echo.
echo ==========================================
echo TEST SUITE 3: Security Hardening
echo ==========================================
echo.
echo Running: jest --config jest.config.cjs tests/security/security-hardening.test.ts
echo.
call npx jest --config jest.config.cjs tests/security/security-hardening.test.ts
set SECURITY_RESULT=%ERRORLEVEL%
if %SECURITY_RESULT% EQU 0 (
    echo [PASS] Security Hardening Tests
) else (
    echo [FAIL] Security Hardening Tests - Exit Code: %SECURITY_RESULT%
)
echo.
echo ==========================================
echo TEST SUITE 4: Communication API Security
echo ==========================================
echo.
echo Running: jest --config jest.config.cjs tests/communication/communication.api.test.ts
echo.
call npx jest --config jest.config.cjs tests/communication/communication.api.test.ts
set COMM_API_RESULT=%ERRORLEVEL%
if %COMM_API_RESULT% EQU 0 (
    echo [PASS] Communication API Tests
) else (
    echo [FAIL] Communication API Tests - Exit Code: %COMM_API_RESULT%
)
echo.
echo ==========================================
echo TEST SUMMARY
echo ==========================================
echo.
echo Execution completed at: %date% %time%
echo.
echo Results:
echo  - Team Defaults:         %DEFAULTS_RESULT% (0=PASS, non-0=FAIL)
echo  - Team API:              %TEAM_API_RESULT% (0=PASS, non-0=FAIL)
echo  - Security Hardening:    %SECURITY_RESULT% (0=PASS, non-0=FAIL)
echo  - Communication API:     %COMM_API_RESULT% (0=PASS, non-0=FAIL)
echo.

REM Calculate overall result
set OVERALL_RESULT=0
if not %DEFAULTS_RESULT% EQU 0 set OVERALL_RESULT=1
if not %TEAM_API_RESULT% EQU 0 set OVERALL_RESULT=1
if not %SECURITY_RESULT% EQU 0 set OVERALL_RESULT=1
if not %COMM_API_RESULT% EQU 0 set OVERALL_RESULT=1

if %OVERALL_RESULT% EQU 0 (
    echo [SUCCESS] All security tests PASSED!
) else (
    echo [FAILURE] One or more test suites FAILED
    echo Please check the output above for details
)

echo.
echo ==========================================
pause
exit /b %OVERALL_RESULT%

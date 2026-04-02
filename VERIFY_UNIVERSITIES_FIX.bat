@echo off
REM Universities Module Testing - Quick Verification Script
REM This script helps verify the fix was applied correctly

echo.
echo ==========================================
echo CampusWay Universities Module - Fix Verification
echo ==========================================
echo.

echo Checking vite.config.ts for SPA configuration...
findstr /N "appType" F:\CampusWay\CampusWay\frontend\vite.config.ts

if errorlevel 1 (
    echo.
    echo ❌ ERROR: appType: 'spa' not found in vite.config.ts
    echo Please apply the fix manually
    echo.
    echo Fix Location: frontend/vite.config.ts, Line 92
    echo Add: appType: 'spa',
    echo.
    echo After adding, save and restart dev server
    pause
) else (
    echo.
    echo ✅ SUCCESS: appType: 'spa' found in vite.config.ts
    echo.
    echo Next Steps:
    echo 1. If dev server is running, stop it (Ctrl+C)
    echo 2. Navigate to: F:\CampusWay\CampusWay\frontend
    echo 3. Run: npm run dev
    echo 4. Wait for "Local: http://localhost:5175/"
    echo 5. Test at: http://localhost:5175/universities
    echo.
    pause
)

@echo off
setlocal EnableDelayedExpansion
title CampusWay - Git Uploader
color 0B

echo ===============================================================================
echo                           CAMPUSWAY GIT UPLOADER
echo ===============================================================================
echo.

:: Show changed files
echo [*] Checking uncommitted changes:
echo -------------------------------------------------------------------------------
git status -s
echo -------------------------------------------------------------------------------
echo.

:: Get current branch dynamically
for /f "delims=" %%i in ('git branch --show-current') do set BRANCH=%%i
echo [*] Target Branch: [!BRANCH!]
echo.

:: Confirm proceeding
set /p proceed="? Do you want to process and upload these changes? (Y/N) [Default: Y]: "
if /I "!proceed!"=="N" (
    echo.
    echo Upload cancelled by user. Have a great day!
    pause
    exit /b
)

echo.
echo ===============================================================================
echo                         STEP 1: CHOOSE COMMIT CATEGORY
echo ===============================================================================
echo  [1] feat     : Added a new feature
echo  [2] fix      : Fixed a bug or issue
echo  [3] style    : UI/CSS changes or code formatting
echo  [4] refactor : Restructured code (no new features/bugs)
echo  [5] chore    : Maintenance, dependencies, cleanup
echo  [C] Custom   : I want to write the full message myself
echo ===============================================================================
echo.

set "commitType=chore"
set /p typeChoice="? Select an option (1-5 or C) [Default: 5]: "

if "!typeChoice!"=="1" set "commitType=feat"
if "!typeChoice!"=="2" set "commitType=fix"
if "!typeChoice!"=="3" set "commitType=style"
if "!typeChoice!"=="4" set "commitType=refactor"
if /I "!typeChoice!"=="C" set "commitType=CUSTOM"

echo.
echo ===============================================================================
echo                         STEP 2: DESCRIBE THE CHANGES
echo ===============================================================================

if "!commitType!"=="CUSTOM" (
    set /p finalMsg="? Enter your full commit message: "
    if "!finalMsg!"=="" set finalMsg=chore: codebase update
) else (
    set /p descMsg="? Enter a short description (e.g., added login button): "
    if "!descMsg!"=="" set descMsg=update files and tweaks
    set finalMsg=!commitType!: !descMsg!
)

echo.
echo ===============================================================================
echo                           STEP 3: UPLOADING TO GITHUB
echo ===============================================================================

echo.
echo [+] Staging all files...
git add .

echo [+] Committing changes...
echo     --] Message: "!finalMsg!"
git commit -m "!finalMsg!"

echo [+] Pushing to GitHub (origin !BRANCH!)...
git push origin !BRANCH!

echo.
echo ===============================================================================
if %ERRORLEVEL% EQU 0 (
    color 0A
    echo [ SUCCESS ] Your code has been completely uploaded to GitHub!
    echo             Render will automatically pick this up and deploy.
) else (
    color 0C
    echo [ ERROR ] Something went wrong during the git upload.
    echo           Please check the messages above to see what failed.
)
echo ===============================================================================
echo.
pause

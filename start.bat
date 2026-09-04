@echo off
cd /d "%~dp0"

echo ============================================================
echo  Starting TCP Monitor Production Server
echo ============================================================
echo.

echo [1/2] Running Pre-start Validations...
echo ------------------------------------------------------------
node scripts/start-check.js
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Pre-start validation failed.
    echo Please resolve the issues above or run setup.bat first.
    echo.
    pause
    exit /b 1
)

echo.
echo [2/2] Launching All Services in Production Mode...
echo ------------------------------------------------------------
call npm run start:all
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Failed to start services.
    echo.
    pause
    exit /b 1
)

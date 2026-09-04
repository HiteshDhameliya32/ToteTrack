@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================================
echo  Starting TCP Monitor Production Setup
echo ============================================================
echo.

echo [1/3] Installing NPM dependencies...
echo ------------------------------------------------------------
echo * Installing Root dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Root npm install failed.
    pause
    exit /b 1
)

echo * Installing TCP-Email dependencies...
cd /d "%~dp0TCP-Email"
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] TCP-Email npm install failed.
    pause
    exit /b 1
)

echo * Installing TCP-email-dashboard dependencies...
cd /d "%~dp0TCP-email-dashboard"
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] TCP-email-dashboard npm install failed.
    pause
    exit /b 1
)

echo * Installing TCP-node-cleanup dependencies...
cd /d "%~dp0TCP-node-cleanup"
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] TCP-node-cleanup npm install failed.
    pause
    exit /b 1
)

cd /d "%~dp0"
echo.
echo [2/3] Running migrations and system health checks...
echo ------------------------------------------------------------
node scripts/setup-check.js
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Health checks and migrations failed!
    pause
    exit /b 1
)

echo.
echo [3/3] Building React Web Dashboard (Production Build)...
echo ------------------------------------------------------------
call npm run build:dashboard
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Dashboard production build failed!
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  TCP Monitor has been successfully configured!
echo  Please run start.bat to launch the production server.
echo ============================================================
echo.
pause

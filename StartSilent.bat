@echo off
cd /d "%~dp0"

node scripts/start-check.js >nul 2>&1
if %ERRORLEVEL% neq 0 (
    exit /b 1
)

call npm run start:all >nul 2>&1
if %ERRORLEVEL% neq 0 (
    exit /b 1
)

exit /b 0

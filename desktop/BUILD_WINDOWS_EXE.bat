@echo off
setlocal
echo ======================================================
echo   RelaySMS Windows (.exe) Installer Builder
echo ======================================================
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js 18+ is required. Install from https://nodejs.org
  pause
  exit /b 1
)

echo [1/3] Installing Electron and electron-builder...
call npm install
if %errorlevel% neq 0 (
  echo [ERROR] npm install failed.
  pause
  exit /b 1
)

echo [2/3] Building RelaySMS NSIS Installer and Portable .exe...
call npm run dist:win
if %errorlevel% neq 0 (
  echo [ERROR] Windows .exe build failed.
  pause
  exit /b 1
)

echo [3/3] Build complete! Check the dist-exe\ folder for:
echo   - RelaySMS-Setup-1.0.0.exe (Windows Installer)
echo   - RelaySMS-1.0.0-portable.exe (Standalone Portable)
pause

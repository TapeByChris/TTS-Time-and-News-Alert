@echo off
cd /d "%~dp0"

REM --- start Node backend in a separate console window ---
start "EconServer" cmd /c "node server.js"

REM wait 2 seconds to let the server boot
timeout /t 2 >nul

REM --- open your dashboard HTML in Brave ---
start "" "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" "file:///%~dp0main.html"

REM If Brave is in a different path, adjust the line above.
REM If you want Chrome instead, you can use something like:
REM start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "file:///%~dp0main.html"

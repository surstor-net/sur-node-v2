@echo off
REM Covia autostart script — launches the Covia venue if not already running
REM Set COVIA_DIR to the folder containing your covia-*.jar

set COVIA_JAR=C:\Users\rich\OLD_PROJECTS\covia.jar

REM Check if already running
curl -s http://localhost:8090/api/v1/status | findstr "ok" >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo Covia already running on port 8090.
    exit /b 0
)

if not exist "%COVIA_JAR%" (
    echo ERROR: JAR not found at %COVIA_JAR%
    exit /b 1
)

echo Starting Covia from %COVIA_JAR%...
cd /d "%~dp0"
start /min "Covia" java -jar "%COVIA_JAR%" "C:\Users\rich\.covia\config.json"

REM Wait for readiness (up to 15 seconds)
set /a tries=0
:wait_loop
timeout /t 1 /nobreak >nul
curl -s http://localhost:8090/api/v1/status | findstr "ok" >nul 2>&1
if %ERRORLEVEL% == 0 (
    echo Covia is up.
    exit /b 0
)
set /a tries+=1
if %tries% lss 15 goto wait_loop

echo WARNING: Covia did not respond after 15 seconds. Check manually.
exit /b 1

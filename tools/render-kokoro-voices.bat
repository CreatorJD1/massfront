@echo off
setlocal
cd /d "%~dp0.."

set "MF_KOKORO_PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
set "MF_KOKORO_LIB=%CD%\.toolchains\kokoro"
set "HF_HOME=%CD%\.toolchains\kokoro-cache"
set "PYTHONPATH=%MF_KOKORO_LIB%"

if not exist "%MF_KOKORO_PY%" (
  echo MASSFRONT voice build needs Python 3.10, 3.11, or 3.12.
  echo Python 3.13 is not supported by Kokoro 0.9.4.
  exit /b 2
)

if not exist "%MF_KOKORO_LIB%\kokoro" (
  echo Installing the offline Kokoro voice-production toolchain...
  "%MF_KOKORO_PY%" -m pip install --target "%MF_KOKORO_LIB%" "kokoro>=0.9.4" soundfile
  if errorlevel 1 exit /b %errorlevel%
)

echo Rendering MASSFRONT voices with Kokoro-82M...
"%MF_KOKORO_PY%" tools\make-voices.py %*
if errorlevel 1 exit /b %errorlevel%

echo.
echo Voice bank complete. Build the optional pack with:
echo   node tools\build-voice-pack.mjs
exit /b 0

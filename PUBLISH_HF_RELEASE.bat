@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"
echo.
echo MASSFRONT - Hugging Face release publisher
echo Builds the web patch, Android APK, source archive, manifests, then publishes them.
echo Make sure `hf auth login` has already been completed on this PC.
echo.
set /p MF_VERSION=Release version (example 1.32.9):
if "%MF_VERSION%"=="" goto :cancel
set /p MF_CATEGORY=Release category (system, hotfix, content, overhaul):
if /I "%MF_CATEGORY%"=="system" goto :category_ok
if /I "%MF_CATEGORY%"=="hotfix" goto :category_ok
if /I "%MF_CATEGORY%"=="content" goto :category_ok
if /I "%MF_CATEGORY%"=="overhaul" goto :category_ok
echo Invalid category. Nothing was changed.
goto :cancel
:category_ok
set /p MF_NOTES=Short player-facing release notes:
if "%MF_NOTES%"=="" set "MF_NOTES=MASSFRONT update."

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\publish-hf-release.ps1" -Version "%MF_VERSION%" -Category "%MF_CATEGORY%" -Notes "%MF_NOTES%"
if errorlevel 1 (
  echo.
  echo RELEASE FAILED - nothing after the failing step was activated. Read the error above.
) else (
  echo.
  echo RELEASE COMPLETE - the in-game updater is now pointing at v%MF_VERSION%.
)
echo.
pause
exit /b

:cancel
echo No version entered. Nothing was changed.
pause

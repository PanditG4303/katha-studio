$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
$root = (Get-Location).Path

$python = "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) { throw "Run scripts\setup.ps1 first." }

Write-Host "Installing PyInstaller..." -ForegroundColor Magenta
& $python -m pip install pyinstaller --quiet
if ($LASTEXITCODE -ne 0) { throw "Could not install PyInstaller." }

Write-Host "Building backend executable..." -ForegroundColor Magenta
if (Test-Path "backend-dist") { Remove-Item -Recurse -Force "backend-dist" }
$resources = Join-Path $root "backend\app\resources"
$entry = Join-Path $root "backend\run_backend.py"
& $python -m PyInstaller --noconfirm --clean --onedir --name katha-backend `
  --distpath "$root\backend-dist" --workpath "$root\build\pyinstaller" --specpath "$root\build" `
  --add-data "$resources;app\resources" `
  --collect-all keyring --collect-all keyring.backends `
  --collect-all playwright `
  --hidden-import uvicorn.logging --hidden-import uvicorn.loops.auto --hidden-import uvicorn.protocols.http.auto `
  --hidden-import uvicorn.protocols.websockets.auto --hidden-import uvicorn.lifespan.on `
  $entry
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed with exit code $LASTEXITCODE." }

$exe = Join-Path $root "backend-dist\katha-backend\katha-backend.exe"
if (-not (Test-Path $exe)) { throw "The backend executable was not created." }

Write-Host "Backend build complete: backend-dist\katha-backend\katha-backend.exe" -ForegroundColor Green

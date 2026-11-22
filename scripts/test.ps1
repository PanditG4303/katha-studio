$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "Running backend tests..." -ForegroundColor Magenta
& backend\.venv\Scripts\python.exe -m pytest backend\tests -q
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Running TypeScript checks..." -ForegroundColor Magenta
npm run typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Running production renderer build..." -ForegroundColor Magenta
npm run build

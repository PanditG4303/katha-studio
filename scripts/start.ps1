$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Test-Path "node_modules")) {
  throw "Katha Studio is not set up yet. Run .\scripts\setup.ps1 first."
}
if (-not (Test-Path "backend\.venv\Scripts\python.exe")) {
  throw "The Python environment is missing. Run .\scripts\setup.ps1 first."
}

Write-Host "Starting Katha Studio..." -ForegroundColor Magenta
npm run dev

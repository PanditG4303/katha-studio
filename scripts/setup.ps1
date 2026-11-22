$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "Katha Studio setup" -ForegroundColor Magenta
Write-Host "------------------" -ForegroundColor DarkGray

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 20 or newer is required. Install it from https://nodejs.org"
}
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
  throw "Python 3.11 or newer is required. Install it from https://python.org and enable 'Add Python to PATH'."
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing desktop dependencies..."
  npm install
}

if (-not (Test-Path "backend\.venv")) {
  Write-Host "Creating Python environment..."
  python -m venv backend\.venv
}
Write-Host "Installing backend dependencies..."
& backend\.venv\Scripts\python.exe -m pip install --upgrade pip --quiet
& backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt --quiet

if (-not (Test-Path "backend\.env")) {
  @"
KATHA_HOST=127.0.0.1
KATHA_PORT=8765
KATHA_LOG_LEVEL=INFO
"@ | Set-Content -Path "backend\.env" -Encoding UTF8
}

Write-Host "Verifying media tools..."
if (-not (Test-Path "node_modules\ffmpeg-static\ffmpeg.exe")) {
  Write-Warning "ffmpeg-static was not found. Run npm install again. Video import will report a clear media-tool error."
}
if (-not (Test-Path "node_modules\ffprobe-static\bin\win32\x64\ffprobe.exe")) {
  Write-Warning "ffprobe-static was not found. Run npm install again."
}

Write-Host "Creating workspace folders..."
$workspace = Join-Path $env:USERPROFILE "Documents\Katha Studio"
New-Item -ItemType Directory -Force -Path $workspace | Out-Null

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Run .\scripts\start.ps1 to open Katha Studio."

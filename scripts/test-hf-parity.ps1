# CodeVerse: Hugging Face Parity Test Script
# This script launches the application with environment constraints matching a free HF Space.

$env:NODE_ENV = "production"
$env:PORT = 7860
$env:SIMULATE_HF = "true"
$env:WORKSPACE_ROOT = "$PSScriptRoot\workspaces"

# Ensure workspaces dir exists locally
if (!(Test-Path $env:WORKSPACE_ROOT)) {
    New-Item -ItemType Directory -Path $env:WORKSPACE_ROOT
}

Write-Host "🚀 Launching CodeVerse in HF SIMULATION MODE..." -ForegroundColor Cyan
Write-Host "   - Docker: DISBALED (Artificial Sandbox)" -ForegroundColor Yellow
Write-Host "   - Memory Limit: 4GB Mode (Next.js)" -ForegroundColor Yellow
Write-Host "   - Port: 7860 (HF Compatibility)" -ForegroundColor Yellow
Write-Host ""

# Run the server
node server.js

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "⚙️ Installing Agent Memory System..." -ForegroundColor Cyan
& (Join-Path $ScriptDir "setup_memory_hook.ps1")

Write-Host "🔄 Reloading profile for current session..." -ForegroundColor DarkGray
. $PROFILE

Write-Host "✅ Agent Memory is now active in this terminal!" -ForegroundColor Green

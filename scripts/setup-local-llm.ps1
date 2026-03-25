# CodeVerse Local LLM Setup Script (Windows)
# This script installs Ollama and pulls the Qwen 2.5 Coder 1.5B model.

function Write-Host-Color($msg, $color) {
    Write-Host "[CodeVerse] $msg" -ForegroundColor $color
}

Write-Host-Color "Starting Local LLM Setup..." "Cyan"

# 1. Check if Ollama is installed
if (Get-Command ollama -ErrorAction SilentlyContinue) {
    Write-Host-Color "Ollama is already installed." "Green"
} else {
    Write-Host-Color "Ollama not found. Downloading installer..." "Yellow"
    Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" -OutFile "$env:TEMP\OllamaSetup.exe"
    Write-Host-Color "Running installer. Please follow the on-screen instructions..." "Yellow"
    Start-Process "$env:TEMP\OllamaSetup.exe" -Wait
    Write-Host-Color "Ollama installed. Note: You might need to restart this terminal." "Green"
}

# 2. Check if Ollama service is running
Write-Host-Color "Verifying Ollama service..." "Cyan"
$ollamaCheck = curl.exe -s http://localhost:11434/api/tags
if ($LASTEXITCODE -ne 0) {
    Write-Host-Color "Ollama is not running. Please start the Ollama application from your tray." "Red"
    return
}

# 3. Pull Qwen 2.5 Coder 1.5B
Write-Host-Color "Pulling Qwen 2.5 Coder 1.5B (optimized for 2vCPU / 16GB RAM)..." "Cyan"
ollama pull qwen2.5-coder:1.5b

Write-Host-Color "Setup Complete! You can now select 'Qwen 2.5 Coder 1.5B (Local)' in the Agent panel." "Green"
Write-Host-Color "Note: If running CodeVerse in Docker, ensure OLLAMA_BASE_URL=http://host.docker.internal:11434/v1 is set in your .env" "Yellow"

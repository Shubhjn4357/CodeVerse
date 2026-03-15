# setup_memory_hook.ps1 v2 - Universal Agent Memory Auto-Activation
# ==================================================================
# Installs short `mem` aliases, tab-completion, CD-hook, git hook.
#
# Usage (run once):
#   powershell -ExecutionPolicy Bypass -File .Agent\setup_memory_hook.ps1
#
# Options:
#   -Uninstall    Remove all hooks from profile
#   -GitHookOnly  Only install git post-commit hook
# ==================================================================

param(
    [switch]$Uninstall,
    [switch]$GitHookOnly
)

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkDir    = Split-Path -Parent $ScriptDir
$MemPy      = Join-Path $ScriptDir "scripts\mem.py"
$CompPy     = Join-Path $ScriptDir "scripts\shell_completions.py"
$PostCommitPy = Join-Path $ScriptDir "hooks\post-commit.py"

function Install-GitHook {
    $gitDir = Join-Path $WorkDir ".git"
    if (-not (Test-Path $gitDir)) {
        Write-Host "  SKIP: No .git directory found - skipping git hook" -ForegroundColor Yellow
        return
    }
    $hooksDir = Join-Path $gitDir "hooks"
    $hookFile = Join-Path $hooksDir "post-commit"
    New-Item -ItemType Directory -Path $hooksDir -Force | Out-Null
    $content = "#!/bin/sh`npython `"$($PostCommitPy.Replace('\','/'))`""
    Set-Content -Path $hookFile -Value $content -Encoding utf8 -NoNewline
    Write-Host "  OK: Git post-commit hook installed" -ForegroundColor Green
}

$profileBlock = @'

## BEGIN: AgentMemorySystem ################################################
# Unified Agent Memory System - Auto-activated on workspace detection
# Uninstall: remove the BEGIN/END block from $PROFILE

# -- Core dispatcher --------------------------------------------------------
function global:mem {
    $agentDir = Get-AgentDir
    if (-not $agentDir) {
        Write-Host "WARN: No .Agent folder found in this workspace" -ForegroundColor Yellow
        return
    }
    python "$agentDir\scripts\mem.py" @args
}

# -- Short aliases ----------------------------------------------------------
function global:mem-status   { mem status }
function global:mem-ctx      { mem ctx @args }
function global:mem-write    { mem write @args }
function global:mem-cp       { mem cp @args }
function global:mem-log      { mem log @args }
function global:mem-search   { mem search @args }
function global:mem-done     { mem done @args }
function global:mem-report   { mem report @args }
function global:mem-tips     { mem tips }
function global:mem-watch    { mem watch @args }
function global:mem-know     { mem know @args }
function global:mem-open     { mem open }
function global:mem-compress { mem compress @args }
function global:mem-analyze  { mem analyze @args }
function global:mem-agent    { mem agent }
function global:mem-init     { mem init }

# -- Workspace resolver -----------------------------------------------------
function global:Get-AgentDir {
    $current = (Get-Location).Path
    while ($current) {
        $candidate = Join-Path $current ".Agent"
        if (Test-Path $candidate -PathType Container) { return $candidate }
        $parent = Split-Path $current -Parent
        if ($parent -eq $current) { return $null }
        $current = $parent
    }
    return $null
}

# -- Tab completion ---------------------------------------------------------
$global:_mem_cmds   = @("status","init","ctx","write","cp","log","search","done","report","tips","watch","know","open","analyze","compress","agent","read","help")
$global:_mem_agents = @("antigravity","gemini","claude","codex","cursor","copilot","jetbrains-ai","zed-ai","sublime","terminal","warp","my_script")
$global:_mem_models = @("gemini-2.5-pro","gemini-2.0-flash","claude-3-7-sonnet","claude-3-5-haiku","gpt-4o","gpt-4o-mini","o3","codex-davinci","default")

Register-ArgumentCompleter -Native -CommandName @('mem','mem-ctx','mem-write','mem-cp','mem-log','mem-search','mem-done','mem-report') -ScriptBlock {
    param($word, $cmd, $cursor)
    $tokens = $cmd.CommandElements
    $prev   = if ($tokens.Count -gt 1) { $tokens[-1].Value } else { '' }

    if ($tokens.Count -le 2 -and $cmd.CommandElements[0].Value -eq 'mem') {
        return $global:_mem_cmds | Where-Object { $_ -like "$word*" } |
            ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
    }
    if ($prev -eq '--agent') {
        return $global:_mem_agents | Where-Object { $_ -like "$word*" } |
            ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
    }
    if ($prev -eq '--model') {
        return $global:_mem_models | Where-Object { $_ -like "$word*" } |
            ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
    }
    if ($word -like '--*') {
        $sub = if ($tokens.Count -gt 1) { $tokens[1].Value } else { '' }
        $flags = switch ($sub) {
            'ctx'      { '--agent','--max-tokens' }
            'write'    { '--agent','--desc','--status','--tags','--id' }
            'cp'       { '--agent','--context' }
            'log'      { '--agent','--model','--task-id','--note' }
            'report'   { '--agent' }
            'analyze'  { '--model' }
            'compress' { '--output' }
            'watch'    { '--interval' }
            default    { @() }
        }
        return $flags | Where-Object { $_ -like "$word*" } |
            ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
    }
}

# -- Auto-activate on cd ----------------------------------------------------
function global:Invoke-AgentMemoryHook {
    $agentDir = Get-AgentDir
    if ($agentDir) {
        $activate = Join-Path $agentDir "scripts\activate.py"
        if (Test-Path $activate) {
            python "$activate" 2>$null
        }
    }
}

function global:Set-Location {
    param([string]$Path)
    Microsoft.PowerShell.Management\Set-Location @args
    Invoke-AgentMemoryHook
}

Invoke-AgentMemoryHook

## END: AgentMemorySystem ##################################################
'@

# -- Uninstall --------------------------------------------------------------
if ($Uninstall) {
    if (Test-Path $PROFILE) {
        $content = Get-Content $PROFILE -Raw
        $cleaned = $content -replace '(?ms)## BEGIN: AgentMemorySystem.*?## END: AgentMemorySystem\s*', ''
        Set-Content $PROFILE -Value $cleaned
        Write-Host "OK: AgentMemorySystem removed from profile" -ForegroundColor Green
    }
    return
}

# -- Git hook only ----------------------------------------------------------
if ($GitHookOnly) {
    Install-GitHook
    return
}

# -- Full install -----------------------------------------------------------
if (-not (Test-Path $PROFILE)) {
    New-Item -ItemType File -Path $PROFILE -Force | Out-Null
}

$existing = Get-Content $PROFILE -Raw -ErrorAction SilentlyContinue

if ($existing -and $existing.Contains("## BEGIN: AgentMemorySystem")) {
    $updated = $existing -replace '(?ms)## BEGIN: AgentMemorySystem.*?## END: AgentMemorySystem', $profileBlock.Trim()
    Set-Content $PROFILE -Value $updated
    Write-Host "OK: AgentMemorySystem updated in profile" -ForegroundColor Cyan
} else {
    Add-Content -Path $PROFILE -Value $profileBlock
    Write-Host "" 
    Write-Host "Agent Memory System - Installed!" -ForegroundColor Cyan
}

Install-GitHook

# Generate Bash/Zsh completions
$hooksDir = Join-Path $ScriptDir "hooks"
New-Item -ItemType Directory -Path $hooksDir -Force | Out-Null
python $CompPy bash 2>$null | Set-Content (Join-Path $hooksDir "bash_completions.sh") -Encoding utf8 -ErrorAction SilentlyContinue
python $CompPy zsh  2>$null | Set-Content (Join-Path $hooksDir "zsh_completions.zsh")  -Encoding utf8 -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "  Profile : $PROFILE"
Write-Host ""
Write-Host "  Short Aliases (available after reopening terminal):" -ForegroundColor Green
Write-Host "    mem                  Show status"
Write-Host "    mem ctx              Load context (auto-detects agent)"
Write-Host "    mem ctx --agent claude"
Write-Host "    mem write 'Task'     Start a task"
Write-Host "    mem cp 'Summary'     Checkpoint (uses active task)"
Write-Host "    mem log 5000 2000    Log token usage"
Write-Host "    mem log 5000 2000 --model gemini-2.5-pro --agent antigravity"
Write-Host "    mem search 'query'   Search all memory"
Write-Host "    mem done 'Summary'   Complete active task"
Write-Host "    mem report           Usage report"
Write-Host "    mem tips             Optimization advice"
Write-Host "    mem open             Open dashboard in browser"
Write-Host "    mem watch            Live watcher"
Write-Host "    mem agent            Show auto-detected agent"
Write-Host ""
Write-Host "  Tab Completion:" -ForegroundColor Green
Write-Host "    mem [TAB]              All subcommands"
Write-Host "    mem ctx --agent [TAB]  All agent names"
Write-Host "    mem log 0 0 --model [TAB]  All model names"
Write-Host ""
Write-Host "  Bash/Zsh completions saved to .Agent\hooks\" -ForegroundColor Green
Write-Host "  Add to ~/.bashrc: source .Agent/hooks/bash_completions.sh"
Write-Host ""
Write-Host "  Open a NEW terminal to activate." -ForegroundColor Yellow

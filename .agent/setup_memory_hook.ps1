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
$WorkspaceRoot = Split-Path -Parent $ScriptDir
$RepoDir    = if (Test-Path (Join-Path $ScriptDir ".git")) { $ScriptDir } else { $WorkspaceRoot }
$MemPy      = Join-Path $ScriptDir "scripts\mem.py"
$CompPy     = Join-Path $ScriptDir "scripts\shell_completions.py"
$SyncPy     = Join-Path $ScriptDir "scripts\sync_workspaces.py"
$PostCommitPy = Join-Path $ScriptDir "hooks\post-commit.py"

function Install-GitHook {
    $gitDir = Join-Path $RepoDir ".git"
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

function Remove-AgentMemorySystemContent {
    param([AllowEmptyString()][string]$Content)

    if ([string]::IsNullOrEmpty($Content)) {
        return ""
    }

    $beginMatches = [regex]::Matches($Content, '## BEGIN: AgentMemorySystem')
    $endMatches   = [regex]::Matches($Content, '## END: AgentMemorySystem[^\r\n]*')

    if ($beginMatches.Count -eq 0 -and $endMatches.Count -eq 0) {
        return $Content.TrimEnd()
    }

    $start = if ($beginMatches.Count -gt 0) { $beginMatches[0].Index } else { 0 }
    $endIndex = if ($endMatches.Count -gt 0) {
        $lastEnd = $endMatches[$endMatches.Count - 1]
        $lastEnd.Index + $lastEnd.Length
    } else {
        $Content.Length
    }

    while ($endIndex -lt $Content.Length -and ($Content[$endIndex] -eq "`r" -or $Content[$endIndex] -eq "`n")) {
        $endIndex++
    }

    $prefix = if ($start -gt 0) { $Content.Substring(0, $start).TrimEnd() } else { "" }
    $suffix = if ($endIndex -lt $Content.Length) { $Content.Substring($endIndex).TrimStart() } else { "" }

    if ([string]::IsNullOrWhiteSpace($prefix)) {
        return $suffix.TrimEnd()
    }
    if ([string]::IsNullOrWhiteSpace($suffix)) {
        return $prefix.TrimEnd()
    }

    return ($prefix + [Environment]::NewLine + [Environment]::NewLine + $suffix).TrimEnd()
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
$global:_mem_agents = @("antigravity","gemini","claude","codex","cursor","copilot","jetbrains-ai","zed-ai","sublime","terminal","warp","my_script","claw","tiny-claw","pico-claw","micro-claw","nano-claw","rtiny-claw")
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
    if ($global:_mem_activated) { return }
    $agentDir = Get-AgentDir
    if ($agentDir) {
        $activate = Join-Path $agentDir "scripts\activate.py"
        if (Test-Path $activate) {
            python "$activate" 2>$null
            $global:_mem_activated = $true
        }
    }
}

function global:Set-Location {
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
        $cleaned = Remove-AgentMemorySystemContent $content
        Set-Content $PROFILE -Value $cleaned -Encoding utf8
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
if (-not (Test-Path (Split-Path $PROFILE -Parent))) {
    New-Item -ItemType Directory -Path (Split-Path $PROFILE -Parent) -Force | Out-Null
}

if (-not (Test-Path $PROFILE)) {
    New-Item -ItemType File -Path $PROFILE -Force | Out-Null
}

$existing = Get-Content $PROFILE -Raw -ErrorAction SilentlyContinue
$cleaned  = Remove-AgentMemorySystemContent $existing
$updated  = if ([string]::IsNullOrWhiteSpace($cleaned)) {
    $profileBlock.Trim() + [Environment]::NewLine
} else {
    $cleaned.TrimEnd() + [Environment]::NewLine + [Environment]::NewLine + $profileBlock.Trim() + [Environment]::NewLine
}

if ($existing -and $existing.Contains("## BEGIN: AgentMemorySystem")) {
    Set-Content $PROFILE -Value $updated -Encoding utf8
    Write-Host "OK: AgentMemorySystem refreshed in profile" -ForegroundColor Cyan
} else {
    Set-Content $PROFILE -Value $updated -Encoding utf8
    Write-Host "" 
    Write-Host "Agent Memory System - Installed!" -ForegroundColor Cyan
}

Install-GitHook

# Generate Bash/Zsh completions
$hooksDir = Join-Path $ScriptDir "hooks"
New-Item -ItemType Directory -Path $hooksDir -Force | Out-Null
python $CompPy bash 2>$null | Set-Content (Join-Path $hooksDir "bash_completions.sh") -Encoding utf8 -ErrorAction SilentlyContinue
python $CompPy zsh  2>$null | Set-Content (Join-Path $hooksDir "zsh_completions.zsh")  -Encoding utf8 -ErrorAction SilentlyContinue

if (Test-Path $SyncPy) {
    Write-Host ""
    Write-Host "  Syncing workspace editor integrations..." -ForegroundColor Cyan
    python $SyncPy --root $WorkspaceRoot
}

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

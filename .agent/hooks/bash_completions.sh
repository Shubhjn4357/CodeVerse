
## BEGIN: MemCompletion ###################################################
_mem_completions() {
    local cur prev words
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"
    words=(${COMP_WORDS[@]})

    if [[ ${#words[@]} -le 2 ]]; then
        COMPREPLY=( $(compgen -W "status init ctx context write cp checkpoint log search done complete report tips watch know open analyze compress agent read help" -- "$cur") )
    elif [[ "$prev" == "--agent" ]]; then
        COMPREPLY=( $(compgen -W "antigravity gemini claude codex cursor copilot jetbrains-ai zed-ai sublime terminal my_script warp" -- "$cur") )
    elif [[ "$prev" == "--model" ]]; then
        COMPREPLY=( $(compgen -W "gemini-2.5-pro gemini-2.0-flash claude-3-7-sonnet claude-3-5-haiku gpt-4o gpt-4o-mini o3 codex-davinci default" -- "$cur") )
    elif [[ "$cur" == --* ]]; then
        local sub="${words[1]}"
        local flags=""
        case "$sub" in
            ctx)      flags="--agent --max-tokens" ;;
            write)    flags="--agent --desc --status --tags --id" ;;
            cp)       flags="--agent --context" ;;
            log)      flags="--agent --model --task-id --note" ;;
            report)   flags="--agent" ;;
            analyze)  flags="--model" ;;
            compress) flags="--output" ;;
            watch)    flags="--interval" ;;
        esac
        COMPREPLY=( $(compgen -W "$flags" -- "$cur") )
    fi
}
complete -F _mem_completions mem
## END: MemCompletion ###################################################


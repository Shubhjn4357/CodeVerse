
## BEGIN: MemCompletion ##################################################
_mem_completions() {
    local cur prev words
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"
    words=(${COMP_WORDS[@]})

    if [[ ${#words[@]} -le 2 ]]; then
        COMPREPLY=($(compgen -W "status init ctx write cp log search done report tips watch know open analyze compress agent read help" -- "$cur"))
    elif [[ "$prev" == "--agent" ]]; then
        COMPREPLY=($(compgen -W "antigravity gemini claude codex cursor copilot jetbrains-ai zed-ai sublime terminal warp claude-code vscode-copilot openai my_script my_custom_agent claw tiny-claw pico-claw micro-claw nano-claw rtiny-claw" -- "$cur"))
    elif [[ "$prev" == "--model" ]]; then
        COMPREPLY=($(compgen -W "claude-3-7-sonnet default gemini-2.0-flash gemini-2.5-pro gpt-4o gpt-4o-mini my-brand-new-llm" -- "$cur"))
    elif [[ "$cur" == --* ]]; then
        local sub="${words[1]}" flags=""
        case "$sub" in
            ctx) flags="--agent --max-tokens" ;;
            write) flags="--agent --desc --status --tags --id" ;;
            cp) flags="--agent --context" ;;
            log) flags="--agent --model --task-id --note" ;;
            report) flags="--agent" ;;
            analyze) flags="--model" ;;
            compress) flags="--output" ;;
            watch) flags="--interval" ;;
        esac
        COMPREPLY=($(compgen -W "$flags" -- "$cur"))
    fi
}
complete -F _mem_completions mem
## END: MemCompletion ###################################################


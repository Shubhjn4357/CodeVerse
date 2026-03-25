
## BEGIN: MemCompletion ##################################################
_mem_complete() {
    local -a cmds agents models flags
    cmds=(status init ctx write cp log search done report tips watch know open analyze compress agent read help)
    agents=(antigravity gemini claude codex cursor copilot jetbrains-ai zed-ai sublime terminal warp claude-code vscode-copilot openai my_script my_custom_agent claw tiny-claw pico-claw micro-claw nano-claw rtiny-claw)
    models=(claude-3-7-sonnet default gemini-2.0-flash gemini-2.5-pro gpt-4o gpt-4o-mini my-brand-new-llm)

    if (( CURRENT == 2 )); then
        _describe 'command' cmds
    elif [[ ${words[${CURRENT-1}]} == '--agent' ]]; then
        _describe 'agent' agents
    elif [[ ${words[${CURRENT-1}]} == '--model' ]]; then
        _describe 'model' models
    else
        case ${words[2]} in
            ctx) flags=(--agent --max-tokens) ;;
            write) flags=(--agent --desc --status --tags --id) ;;
            cp) flags=(--agent --context) ;;
            log) flags=(--agent --model --task-id --note) ;;
            report) flags=(--agent) ;;
            analyze) flags=(--model) ;;
            compress) flags=(--output) ;;
            watch) flags=(--interval) ;;
        esac
        _describe 'option' flags
    fi
}
compdef _mem_complete mem
## END: MemCompletion ###################################################


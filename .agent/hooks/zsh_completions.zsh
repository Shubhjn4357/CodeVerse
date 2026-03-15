
## BEGIN: MemCompletion ###################################################
_mem_complete() {
    local -a cmds agents models flags
    cmds=(status init ctx context write cp checkpoint log search done complete report tips watch know open analyze compress agent read help)
    agents=(antigravity gemini claude codex cursor copilot jetbrains-ai zed-ai sublime terminal my_script warp)
    models=(gemini-2.5-pro gemini-2.0-flash claude-3-7-sonnet claude-3-5-haiku gpt-4o gpt-4o-mini o3 codex-davinci default)

    if (( CURRENT == 2 )); then
        _describe 'mem command' cmds
    elif [[ ${words[${CURRENT-1}]} == '--agent' ]]; then
        _describe 'agent' agents
    elif [[ ${words[${CURRENT-1}]} == '--model' ]]; then
        _describe 'model' models
    else
        case ${words[2]} in
            ctx)      flags=(--agent --max-tokens) ;;
            write)    flags=(--agent --desc --status --tags --id) ;;
            cp)       flags=(--agent --context) ;;
            log)      flags=(--agent --model --task-id --note) ;;
            report)   flags=(--agent) ;;
            analyze)  flags=(--model) ;;
            compress) flags=(--output) ;;
            watch)    flags=(--interval) ;;
        esac
        _describe 'option' flags
    fi
}
compdef _mem_complete mem
## END: MemCompletion ###################################################


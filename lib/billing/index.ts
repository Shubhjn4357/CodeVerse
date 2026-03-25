import fs from 'fs/promises';
import path from 'path';
import { MODELS, MARKUP_MULTIPLIER } from '@/constants/pricing';

const WORKSPACE_ROOT = process.cwd();
const USAGE_FILE = path.join(WORKSPACE_ROOT, '.agent', 'memory', 'usage-tracker.json');

export async function logUsage(
    agent: string,
    modelId: string,
    inputTokens: number,
    outputTokens: number,
    taskTitle: string = ""
) {
    try {
        const raw = await fs.readFile(USAGE_FILE, 'utf-8');
        const data = JSON.parse(raw);

        const model = MODELS[modelId];
        if (!model) throw new Error(`Unknown model: ${modelId}`);

        // Cost calculation in USD
        const baseInputCost = (inputTokens / 1_000_000) * model.costInputPerM;
        const baseOutputCost = (outputTokens / 1_000_000) * model.costOutputPerM;
        const totalCost = (baseInputCost + baseOutputCost) * MARKUP_MULTIPLIER;

        const entry = {
            id: crypto.randomUUID().slice(0, 8),
            agent,
            model: modelId,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens,
            cost_usd: Number(totalCost.toFixed(6)),
            task_id: taskTitle,
            note: "Logged via CodeVerse UI",
            logged_at: new Date().toISOString()
        };

        // Update sessions
        data.sessions = [entry, ...(data.sessions || [])];

        // Update totals
        if (!data.totals) data.totals = {};
        if (!data.totals[agent]) {
            data.totals[agent] = {
                input_tokens: 0,
                output_tokens: 0,
                total_tokens: 0,
                cost_usd: 0,
                session_count: 0,
                models_used: []
            };
        }

        const t = data.totals[agent];
        t.input_tokens += inputTokens;
        t.output_tokens += outputTokens;
        t.total_tokens += (inputTokens + outputTokens);
        t.cost_usd = Number((t.cost_usd + totalCost).toFixed(6));
        t.session_count += 1;
        if (!t.models_used.includes(modelId)) {
            t.models_used.push(modelId);
        }

        await fs.writeFile(USAGE_FILE, JSON.stringify(data, null, 2), 'utf-8');
        return entry;
    } catch (err) {
        console.error("Failed to log usage to .Agent tracking:", err);
        throw err;
    }
}

export async function getUsageReport() {
    try {
        const raw = await fs.readFile(USAGE_FILE, 'utf-8');
        return JSON.parse(raw);
    } catch (err:unknown) {
        if (err instanceof Error) {
            console.error("Failed to get usage report:", err.message);
        }
        return { sessions: [], totals: {} };
    }
}

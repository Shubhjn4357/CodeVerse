"use server";

import { logUsage, getUsageReport } from "@/lib/billing";

export async function getBillingReportAction() {
    return getUsageReport();
}

export async function logUsageAction(
    agent: string,
    modelId: string,
    inputTokens: number,
    outputTokens: number,
    taskTitle: string = ""
) {
    try {
        const entry = await logUsage(agent, modelId, inputTokens, outputTokens, taskTitle);
        return { success: true, entry };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

"use client";

import { motion } from "framer-motion";
import { CheckCircle2, CircleDashed, XCircle, AlertCircle, Play, FileCode2 } from "lucide-react";

export interface PlanStep {
    id: string;
    description: string;
    filesData?: string[];
    status: "pending" | "running" | "done" | "error";
    error?: string;
}

interface PlanViewProps {
    steps: PlanStep[];
    goal: string;
    onExecute: () => void;
    isExecuting: boolean;
    onExecuteStep: (id: string) => void;
}

export function PlanView({ steps, goal, onExecute, isExecuting, onExecuteStep }: PlanViewProps) {

    const getIcon = (status: string) => {
        switch (status) {
            case "done": return <CheckCircle2 size={16} className="text-(--success)" />;
            case "running": return <span className="w-4 h-4 rounded-full border-2 border-(--accent) border-t-transparent animate-spin" />;
            case "error": return <XCircle size={16} className="text-(--error)" />;
            default: return <CircleDashed size={16} className="text-(--text-muted)" />;
        }
    };

    if (!steps.length) return null;

    const total = steps.length;
    const done = steps.filter(s => s.status === "done").length;
    const progress = Math.round((done / total) * 100);

    return (
        <div className="flex flex-col gap-4 p-4 border border-(--border-subtle) rounded-xl bg-(--surface) text-(--text)">
            {/* Header */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-sm text-(--accent)">Implementation Plan</h3>
                    <span className="badge bg-(--bg-3) text-(--text-muted) tabular-nums">{done} / {total}</span>
                </div>
                <p className="text-xs text-(--text-muted)">{goal}</p>

                {/* Progress bar */}
                <div className="w-full bg-(--bg-3) h-1.5 rounded-full mt-3 overflow-hidden">
                    <motion.div
                        className="h-full bg-(--accent)"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* Steps checklist */}
            <div className="flex flex-col gap-2">
                {steps.map((step, i) => (
                    <div
                        key={step.id}
                        className={`plan-step text-sm ${step.status === "running" ? "running" : step.status === "done" ? "done" : step.status === "error" ? "error" : ""}`}
                    >
                        <div className="mt-0.5 shrink-0">
                            {getIcon(step.status)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={`font-medium ${step.status === "done" ? "line-through text-(--text-muted)" : "text-(--text)"}`}>
                                Step {i + 1}: {step.description}
                            </p>

                            {step.filesData && step.filesData.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2">
                                    {step.filesData.map((f, j) => (
                                        <span key={j} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-(--bg-3) text-(--text-muted) border border-(--border) truncate max-w-[150px]">
                                            <FileCode2 size={10} /> {f}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {step.error && (
                                <div className="mt-2 text-xs text-(--error) bg-[rgba(248,81,73,0.1)] p-2 rounded flex items-start gap-1">
                                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                    <p>{step.error}</p>
                                </div>
                            )}
                        </div>

                        {(step.status === "pending" || step.status === "error") && !isExecuting && (
                            <button
                                onClick={() => onExecuteStep(step.id)}
                                className="activity-btn w-6 h-6 bg-(--surface) text-(--text-muted) hover:text-(--accent) shrink-0"
                                title="Run this step"
                            >
                                <Play size={12} fill="currentColor" />
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Global Actions */}
            {!isExecuting && done < total && (
                <button
                    onClick={onExecute}
                    className="btn btn-primary w-full justify-center mt-2"
                >
                    <Play size={14} fill="currentColor" /> Execute Plan Automatically
                </button>
            )}

            {done === total && total > 0 && (
                <div className="flex items-center justify-center gap-2 text-sm text-(--success) font-medium p-2 bg-[rgba(57,211,83,0.1)] rounded-lg">
                    <CheckCircle2 size={16} /> Plan execution complete
                </div>
            )}
        </div>
    );
}

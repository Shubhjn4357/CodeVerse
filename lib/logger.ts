/**
 * 🛠️ CodeVerse Centralized Logger
 * Strict, production-ready logging utility for Hugging Face Spaces.
 * 100% Type-safe: Removed all 'any' for industrial-grade observability.
 */

type LogLevel = "INFO" | "WARN" | "ERROR" | "FATAL" | "DEBUG";

const isDev = process.env.NODE_ENV === "development";

function formatMessage(level: LogLevel, context: string, message: string) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] [${context}] ${message}`;
}

export const logger = {
    info: (context: string, message: string) => {
        console.log(formatMessage("INFO", context, message));
    },
    warn: (context: string, message: string) => {
        console.warn(formatMessage("WARN", context, message));
    },
    error: (context: string, message: string, error?: unknown) => {
        console.error(formatMessage("ERROR", context, message), error || "");
    },
    fatal: (context: string, message: string, error?: unknown) => {
        console.error(formatMessage("FATAL", context, message), error || "");
    },
    debug: (context: string, message: string) => {
        if (isDev) {
            console.log(formatMessage("DEBUG", context, message));
        }
    }
};

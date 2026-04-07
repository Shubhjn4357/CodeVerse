import { createClient, type Client } from "@libsql/client";
import { initDb } from "./schema";

const url = process.env.TURSO_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

/**
 * 🛠️ LibSQL Client Singleton (Native Edition)
 * Provides 100% stable, high-performance database access without Drizzle overhead.
 * Optimized for sandboxed execution on Hugging Face Spaces.
 */
export const client: Client = createClient({
  url,
  authToken,
});

/**
 * 🛡️ Database Client Export
 * Used by authentication and action layers.
 */
export const db = client; 

// 🚀 Self-Bootstrapping Database
// We pass the client directly to avoid circular dependency with schema.ts
initDb(client).catch((err: unknown) => {
  console.error("[DB:ERROR] Database bootstrap failed:", err);
});

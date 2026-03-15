import { createClient } from "@libsql/client";

export const dbUrl = process.env.TURSO_DATABASE_URL || "file:./codeverse.db";
export const dbToken = process.env.TURSO_AUTH_TOKEN || "";

export const db = createClient({
    url: dbUrl,
    authToken: dbToken,
});

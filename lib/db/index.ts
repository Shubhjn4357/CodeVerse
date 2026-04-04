import { createClient } from "@libsql/client";
import { existsSync } from "fs";

export const dbUrl = process.env.TURSO_DATABASE_URL || 
                   (existsSync("/data") ? "file:/data/codeverse.db" : "file:./codeverse.db");
export const dbToken = process.env.TURSO_AUTH_TOKEN || "";

export const db = createClient({
    url: dbUrl,
    authToken: dbToken,
});

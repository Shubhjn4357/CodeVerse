"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.client = void 0;
const client_1 = require("@libsql/client");
const url = process.env.TURSO_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;
/**
 * 🛠️ LibSQL Client Singleton (Native Edition)
 * Provides 100% stable, high-performance database access without Drizzle overhead.
 * Optimized for sandboxed execution on Hugging Face Spaces.
 */
exports.client = (0, client_1.createClient)({
    url,
    authToken,
});
/**
 * 🛡️ Database Client Export
 * Used by authentication and action layers.
 */
exports.db = exports.client;
// 🚀 Database lifecycle is managed by the server entrypoint to ensure proper synchronization.

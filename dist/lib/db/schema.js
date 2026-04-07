"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rawSchema = void 0;
exports.initDb = initDb;
exports.rawSchema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  image TEXT,
  github_username TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  provider TEXT NOT NULL,
  providerAccountId TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  container_id TEXT,
  android_container_id TEXT,
  status TEXT DEFAULT 'stopped',
  port_mapping INTEGER,
  android_port INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_invocations TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS communities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  owner_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  sessionToken TEXT UNIQUE NOT NULL,
  userId TEXT NOT NULL,
  expires DATETIME NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires DATETIME NOT NULL,
  PRIMARY KEY (identifier, token)
);
`;
/**
 * 🚀 Database Initialization Routine
 * Hardened for Hugging Face Spaces: Ensures schema exists and dev user is seeded.
 */
async function initDb(client) {
    // Use raw execution for robustness during cold start
    await client.executeMultiple(exports.rawSchema);
    // 🌱 SEEDING (Dev Only): Create a 'Developer Guest' user for the login bypass
    if (process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_NODE_ENV === "development") {
        try {
            await client.execute({
                sql: "INSERT OR IGNORE INTO users (id, name, email, image) VALUES (?, ?, ?, ?)",
                args: ["dev-user-id", "Developer Guest", "dev@codeverse.local", "https://github.com/identicons/dev.png"]
            });
            console.log("[SYSTEM] Dev Seeding: 'Developer Guest' user ready.");
        }
        catch (e) {
            console.error("[SYSTEM] Dev Seeding failed:", e);
        }
    }
}

import { initDb } from "./lib/db/schema";

async function main() {
    console.log("Initializing database schema...");
    try {
        await initDb();
        console.log("Database schema applied successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Failed to initialize database:", error);
        process.exit(1);
    }
}

main();

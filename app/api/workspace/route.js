"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
exports.POST = POST;
const server_1 = require("next/server");
const manager_1 = require("@/lib/docker/manager");
const auth_1 = require("@/auth");
const db_1 = require("@/lib/db");
function GET(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const session = yield (0, auth_1.auth)();
        if (!((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.id)) {
            return server_1.NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const { searchParams } = new URL(req.url);
        const action = searchParams.get("action");
        if (action === "statusAll") {
            try {
                // Fetch all workspaces for user and return their statuses
                const res = yield db_1.db.execute({
                    sql: "SELECT id, status FROM workspaces WHERE user_id = ?",
                    args: [session.user.id]
                });
                const statuses = {};
                res.rows.forEach(row => {
                    statuses[row.id] = row.status;
                });
                return server_1.NextResponse.json({ statuses });
            }
            catch (e) {
                console.error("[WORKSPACE_API_ERROR]", e);
                return server_1.NextResponse.json({ error: e.message }, { status: 500 });
            }
        }
        return server_1.NextResponse.json({ error: "Invalid action" }, { status: 400 });
    });
}
function POST(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const session = yield (0, auth_1.auth)();
        if (!((_a = session === null || session === void 0 ? void 0 : session.user) === null || _a === void 0 ? void 0 : _a.id)) {
            return server_1.NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        try {
            const body = yield req.json();
            const { action, id, image } = body;
            if (!id) {
                return server_1.NextResponse.json({ error: "Missing workspace id" }, { status: 400 });
            }
            // Verify ownership and get project name
            const verifyObj = yield db_1.db.execute({
                sql: "SELECT id, project_name FROM workspaces WHERE id = ? AND user_id = ?",
                args: [id, session.user.id]
            });
            if (verifyObj.rows.length === 0) {
                return server_1.NextResponse.json({ error: "Workspace not found or unauthorized" }, { status: 404 });
            }
            const projectName = verifyObj.rows[0].project_name;
            if (action === "start") {
                const { withAndroidEmulator } = body;
                const result = yield (0, manager_1.startWorkspaceContainer)({
                    id,
                    userId: session.user.id,
                    projectName,
                    image,
                    withAndroidEmulator
                });
                if (result.success) {
                    yield db_1.db.execute({
                        sql: "UPDATE workspaces SET status = 'running', container_id = ?, android_container_id = ?, android_port = ? WHERE id = ?",
                        args: [result.containerId || null, result.androidContainerId || null, result.androidPort || null, id]
                    });
                }
                return server_1.NextResponse.json(result);
            }
            else if (action === "stop") {
                const result = yield (0, manager_1.stopWorkspaceContainer)(id);
                if (result.success) {
                    yield db_1.db.execute({
                        sql: "UPDATE workspaces SET status = 'stopped' WHERE id = ?",
                        args: [id]
                    });
                }
                return server_1.NextResponse.json(result);
            }
            else if (action === "rebuild") {
                const { withAndroidEmulator } = body;
                // 1. Fully destroy existing containers
                yield (0, manager_1.stopWorkspaceContainer)(id);
                // 2. Recreate them (this will pick up codeverse.json changes)
                const result = yield (0, manager_1.startWorkspaceContainer)({
                    id,
                    userId: session.user.id,
                    projectName,
                    image,
                    withAndroidEmulator
                });
                if (result.success) {
                    yield db_1.db.execute({
                        sql: "UPDATE workspaces SET status = 'running', container_id = ?, android_container_id = ?, android_port = ? WHERE id = ?",
                        args: [result.containerId || null, result.androidContainerId || null, result.androidPort || null, id]
                    });
                }
                return server_1.NextResponse.json(result);
            }
            return server_1.NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }
        catch (e) {
            return server_1.NextResponse.json({ error: e.message }, { status: 500 });
        }
    });
}

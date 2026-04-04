"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.dbToken = exports.dbUrl = void 0;
const client_1 = require("@libsql/client");
const fs_1 = require("fs");
exports.dbUrl = process.env.TURSO_DATABASE_URL ||
    ((0, fs_1.existsSync)("/data") ? "file:/data/codeverse.db" : "file:./codeverse.db");
exports.dbToken = process.env.TURSO_AUTH_TOKEN || "";
exports.db = (0, client_1.createClient)({
    url: exports.dbUrl,
    authToken: exports.dbToken,
});

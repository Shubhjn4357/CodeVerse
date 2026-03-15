"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.dbToken = exports.dbUrl = void 0;
var client_1 = require("@libsql/client");
exports.dbUrl = process.env.TURSO_DATABASE_URL || "file:./codeverse.db";
exports.dbToken = process.env.TURSO_AUTH_TOKEN || "";
exports.db = (0, client_1.createClient)({
    url: exports.dbUrl,
    authToken: exports.dbToken,
});

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
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.schema = void 0;
exports.initDb = initDb;
exports.schema = "\nCREATE TABLE IF NOT EXISTS users (\n  id TEXT PRIMARY KEY,\n  name TEXT,\n  email TEXT UNIQUE,\n  image TEXT,\n  github_username TEXT,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);\n\nCREATE TABLE IF NOT EXISTS accounts (\n  id TEXT PRIMARY KEY,\n  userId TEXT NOT NULL,\n  provider TEXT NOT NULL,\n  providerAccountId TEXT NOT NULL,\n  refresh_token TEXT,\n  access_token TEXT,\n  expires_at INTEGER,\n  token_type TEXT,\n  scope TEXT,\n  id_token TEXT,\n  session_state TEXT,\n  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE\n);\n\nCREATE TABLE IF NOT EXISTS sessions (\n  id TEXT PRIMARY KEY,\n  sessionToken TEXT UNIQUE NOT NULL,\n  userId TEXT NOT NULL,\n  expires DATETIME NOT NULL,\n  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE\n);\n\nCREATE TABLE IF NOT EXISTS verification_tokens (\n  identifier TEXT NOT NULL,\n  token TEXT UNIQUE NOT NULL,\n  expires DATETIME NOT NULL,\n  PRIMARY KEY (identifier, token)\n);\n\nCREATE TABLE IF NOT EXISTS workspaces (\n  id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  project_name TEXT NOT NULL,\n  container_id TEXT,\n  status TEXT DEFAULT 'stopped',\n  port_mapping INTEGER,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE\n);\n\nCREATE TABLE IF NOT EXISTS api_keys (\n  id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  provider TEXT NOT NULL,\n  key_hash TEXT NOT NULL,\n  key_preview TEXT NOT NULL,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE\n);\n\nCREATE TABLE IF NOT EXISTS usage_logs (\n  id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL,\n  model TEXT NOT NULL,\n  prompt_tokens INTEGER NOT NULL,\n  completion_tokens INTEGER NOT NULL,\n  cost_cents REAL NOT NULL,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE\n);\n\nCREATE TABLE IF NOT EXISTS user_settings (\n  user_id TEXT PRIMARY KEY,\n  settings_json TEXT NOT NULL,\n  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,\n  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE\n);\n";
function initDb() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("./index"); })];
                case 1:
                    db = (_a.sent()).db;
                    // Execute schema creation
                    // In a real production app, use migrations
                    return [4 /*yield*/, db.executeMultiple(exports.schema)];
                case 2:
                    // Execute schema creation
                    // In a real production app, use migrations
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}

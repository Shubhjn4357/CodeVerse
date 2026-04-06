import { NextRequest, NextResponse } from "next/server";
import os from "os";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
        headers[key] = value;
    });

    // Capture diagnostic info about the current environment
    const diagnostics = {
        timestamp: new Date().toISOString(),
        url: req.url,
        method: req.method,
        protocol: headers["x-forwarded-proto"] || "http",
        host: headers["host"],
        forwardedHost: headers["x-forwarded-host"] || null,
        ip: headers["x-forwarded-for"] || headers["x-real-ip"] || null,
        userAgent: headers["user-agent"],
        runtime: {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            uptime: process.uptime(),
            loadAvg: os.loadavg(),
            memory: process.memoryUsage(),
        },
        env_flags: {
            AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST || "not set",
            SPACE_ID: process.env.SPACE_ID || "not set",
            NODE_ENV: process.env.NODE_ENV || "not set",
            HOSTNAME: process.env.HOSTNAME || "not set",
        },
        headers: headers
    };

    return NextResponse.json(diagnostics, {
        headers: {
            "Cache-Control": "no-store, max-age=0",
        },
    });
}

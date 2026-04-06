import { NextResponse } from "next/server";
import os from "os";

export const dynamic = "force-dynamic";

export async function GET() {
  const mem = process.memoryUsage();
  return NextResponse.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    uptime: {
        process: process.uptime(),
        system: os.uptime(),
    },
    memory: {
        rss: `${Math.round(mem.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
    },
    system: {
        loadAvg: os.loadavg(),
        freeMem: `${Math.round(os.freemem() / 1024 / 1024)} MB`,
        totalMem: `${Math.round(os.totalmem() / 1024 / 1024)} MB`,
    }
  });
}

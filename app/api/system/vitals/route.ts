import { NextResponse } from 'next/server';
import os from 'os';

/**
 * Infrastructure Health & Vitals API.
 * Provides real-time metrics for Hugging Face Spaces monitoring.
 */
export async function GET() {
    const memory = process.memoryUsage();
    const systemMemory = {
        free: os.freemem(),
        total: os.totalmem(),
    };

    const uptime = process.uptime();
    const load = os.loadavg();

    return NextResponse.json({
        success: true,
        vitals: {
            process: {
                rss: (memory.rss / 1024 / 1024).toFixed(2), // MB
                heapUsed: (memory.heapUsed / 1024 / 1024).toFixed(2), // MB
                heapTotal: (memory.heapTotal / 1024 / 1024).toFixed(2), // MB
            },
            system: {
                freeMB: (systemMemory.free / 1024 / 1024).toFixed(0),
                totalMB: (systemMemory.total / 1024 / 1024).toFixed(0),
                loadAverage: load[0].toFixed(2),
            },
            status: {
                uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
                nodeVersion: process.version,
            }
        }
    });
}

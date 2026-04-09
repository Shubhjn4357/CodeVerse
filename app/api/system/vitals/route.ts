import { NextResponse } from 'next/server';
import os from 'os';
import type { SystemVitals, SystemVitalsResponse } from '@/lib/system/vitals';

/**
 * Infrastructure Health & Vitals API.
 * Provides real-time metrics for Hugging Face Spaces monitoring.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
    const memory = process.memoryUsage();
    const systemMemory: SystemVitals['systemMemory'] = {
        free: os.freemem(),
        total: os.totalmem(),
    };

    const uptime = process.uptime();
    const load = os.loadavg() as SystemVitals['loadAvg'];

    const vitals: SystemVitals = {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        loadAvg: load,
        uptime,
        systemMemory,
        nodeVersion: process.version,
    };

    const response: SystemVitalsResponse = {
        success: true,
        vitals,
    };

    return NextResponse.json(response, {
        headers: {
            'Cache-Control': 'no-store',
        },
    });
}

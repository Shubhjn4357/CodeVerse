export interface SystemVitals {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    loadAvg: [number, number, number];
    uptime: number;
    systemMemory: {
        free: number;
        total: number;
    };
    nodeVersion: string;
}

export interface SystemVitalsResponse {
    success: true;
    vitals: SystemVitals;
}

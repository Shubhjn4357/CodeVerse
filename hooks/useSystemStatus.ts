import { useState, useEffect } from "react";

export interface SystemStatusData {
    timestamp: string;
    uptime: {
        process: number;
        system: number;
    };
    memory: {
        rss: string;
        heapTotal: string;
        heapUsed: string;
    };
    system: {
        loadAvg: number[];
        freeMem: string;
        totalMem: string;
    };
}

export interface DiagnosticsData {
    timestamp: string;
    protocol: string;
    host: string;
    forwardedHost: string | null;
    ip: string | null;
    userAgent: string;
    env_flags: {
        AUTH_TRUST_HOST: string;
        SPACE_ID: string;
        NODE_ENV: string;
        HOSTNAME: string;
    };
    headers: Record<string, string>;
}

export function useSystemStatus() {
    const [status, setStatus] = useState<SystemStatusData | null>(null);
    const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        try {
            const [healthRes, diagRes] = await Promise.all([
                fetch("/api/health"),
                fetch("/api/diag")
            ]);

            if (!healthRes.ok || !diagRes.ok) {
                throw new Error("Failed to fetch system data");
            }

            const [healthData, diagData] = await Promise.all([
                healthRes.json(),
                diagRes.json()
            ]);

            setStatus(healthData);
            setDiagnostics(diagData);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000); // 10s refresh
        return () => clearInterval(interval);
    }, []);

    return { status, diagnostics, loading, error, refetch: fetchData };
}

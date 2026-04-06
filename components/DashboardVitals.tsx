"use client";

import { useEffect, useState } from "react";
import { Activity, Cpu, Database, Server } from "lucide-react";

interface VitalsData {
    process: {
        rss: string;
        heapUsed: string;
        heapTotal: string;
    };
    system: {
        freeMB: string;
        totalMB: string;
        loadAverage: string;
    };
    status: {
        uptime: string;
        nodeVersion: string;
    };
}

export default function DashboardVitals() {
    const [vitals, setVitals] = useState<VitalsData | null>(null);

    useEffect(() => {
        const fetchVitals = async () => {
            try {
                const res = await fetch("/api/system/vitals");
                const data = await res.json();
                if (data.success) setVitals(data.vitals);
            } catch (e) {
                console.error("Vitals fetch failed:", e);
            }
        };

        fetchVitals();
        const interval = setInterval(fetchVitals, 10000); // 10s refresh
        return () => clearInterval(interval);
    }, []);

    if (!vitals) return <div className="h-20 animate-pulse bg-zinc-900/50 rounded-xl border border-white/5" />;

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4 flex items-center gap-4 hover:border-blue-500/30 transition-all group">
                <div className="p-3 rounded-lg bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform">
                    <Activity size={20} />
                </div>
                <div>
                    <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Process Load</div>
                    <div className="text-lg font-mono text-zinc-200">{vitals.system.loadAverage}</div>
                </div>
            </div>

            <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4 flex items-center gap-4 hover:border-green-500/30 transition-all group">
                <div className="p-3 rounded-lg bg-green-500/10 text-green-400 group-hover:scale-110 transition-transform">
                    <Database size={20} />
                </div>
                <div>
                    <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Memory RSS</div>
                    <div className="text-lg font-mono text-zinc-200">{vitals.process.rss} MB</div>
                </div>
            </div>

            <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4 flex items-center gap-4 hover:border-purple-500/30 transition-all group">
                <div className="p-3 rounded-lg bg-purple-500/10 text-purple-400 group-hover:scale-110 transition-transform">
                    <Server size={20} />
                </div>
                <div>
                    <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Uptime</div>
                    <div className="text-lg font-mono text-zinc-200">{vitals.status.uptime}</div>
                </div>
            </div>

             <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-4 flex items-center gap-4 hover:border-amber-500/30 transition-all group">
                <div className="p-3 rounded-lg bg-amber-500/10 text-amber-400 group-hover:scale-110 transition-transform">
                    <Cpu size={20} />
                </div>
                <div>
                    <div className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Free System</div>
                    <div className="text-lg font-mono text-zinc-200">{vitals.system.freeMB} MB</div>
                </div>
            </div>
        </div>
    );
}

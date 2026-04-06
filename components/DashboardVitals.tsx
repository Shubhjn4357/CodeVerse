"use client";

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Cpu, HardDrive, Zap } from 'lucide-react';

interface VitalsData {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    loadAvg: number[];
    uptime: number;
}

/**
 * Premium Infrastructure Vitals Monitor (2026 Studio Edition)
 * Visualizes real-time system performance with smooth animations and glassmorphism.
 */
export const DashboardVitals: React.FC = () => {
    const [vitals, setVitals] = useState<VitalsData | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchVitals = async () => {
            try {
                const res = await fetch('/api/stats');
                if (res.ok) {
                    const data = await res.json();
                    setVitals(data);
                }
            } catch {
                setError("Vitals Link Offline");
            }
        };

        fetchVitals();
        const interval = setInterval(fetchVitals, 5000);
        return () => clearInterval(interval);
    }, []);

    const formatBytes = (bytes: number) => {
        const mb = bytes / (1024 * 1024);
        return mb.toFixed(1) + " MB";
    };

    if (error) return <div className="text-red-400 p-4 text-xs font-mono">{error}</div>;
    if (!vitals) return <div className="animate-pulse bg-slate-800/50 h-32 rounded-xl border border-slate-700/50" />;

    const load = vitals.loadAvg[0] || 0;
    const loadColor = load > 2.0 ? 'text-red-400' : load > 1.0 ? 'text-amber-400' : 'text-emerald-400';

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4"
        >
            <VitalsCard 
                icon={<Cpu size={18} />} 
                label="System Load" 
                value={load.toFixed(2)} 
                subtext="1 min avg"
                color={loadColor}
            />
            <VitalsCard 
                icon={<Activity size={18} />} 
                label="Process Memory" 
                value={formatBytes(vitals.rss)} 
                subtext={`Heap: ${formatBytes(vitals.heapUsed)}`}
                color="text-sky-400"
            />
            <VitalsCard 
                icon={<HardDrive size={18} />} 
                label="Heap Health" 
                value={((vitals.heapUsed / vitals.heapTotal) * 100).toFixed(0) + "%"} 
                subtext="Utilization"
                color="text-indigo-400"
            />
            <VitalsCard 
                icon={<Zap size={18} />} 
                label="Node Uptime" 
                value={Math.floor(vitals.uptime / 3600) + "h " + Math.floor((vitals.uptime % 3600) / 60) + "m"} 
                subtext="Live Session"
                color="text-rose-400"
            />
        </motion.div>
    );
};

const VitalsCard = ({ icon, label, value, subtext, color }: { icon: React.ReactNode, label: string, value: string, subtext: string, color: string }) => (
    <div className="relative overflow-hidden bg-slate-900/60 backdrop-blur-md border border-slate-800 p-4 rounded-2xl group transition-all hover:bg-slate-800/80 hover:border-slate-700 shadow-xl">
        <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg bg-slate-800/50 ${color}`}>
                {icon}
            </div>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{label}</span>
        </div>
        <AnimatePresence mode="wait">
            <motion.div 
                key={value}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className={`text-xl font-mono font-bold tracking-tight ${color}`}
            >
                {value}
            </motion.div>
        </AnimatePresence>
        <div className="text-[10px] text-slate-500 mt-1 font-medium">{subtext}</div>
        
        {/* Subtle decorative glow */}
        <div className={`absolute -right-4 -bottom-4 w-16 h-16 rounded-full opacity-10 blur-2xl bg-current ${color}`} />
    </div>
);

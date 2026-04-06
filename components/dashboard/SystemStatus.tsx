"use client";

import { useSystemStatus } from "@/hooks/useSystemStatus";
import { motion } from "framer-motion";
import { 
    Activity, Shield, Globe, Server, 
    Cpu, MemoryStick as Memory, Clock, 
    ArrowLeft, RefreshCw, AlertTriangle
} from "lucide-react";
import Link from "next/link";

export default function SystemStatus() {
    const { status, diagnostics, loading, error, refetch } = useSystemStatus();

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center bg-(--bg)">
                <div className="flex flex-col items-center gap-4">
                    <RefreshCw className="animate-spin text-(--accent)" size={32} />
                    <p className="text-(--text-muted) animate-pulse font-medium">Fetching System State...</p>
                </div>
            </div>
        );
    }

    if (error || !status || !diagnostics) {
        return (
            <div className="h-full flex items-center justify-center p-8 bg-(--bg)">
                <div className="max-w-md w-full bg-(--surface) border border-(--error)/20 rounded-2xl p-8 text-center shadow-2xl">
                    <AlertTriangle className="mx-auto text-(--error) mb-4" size={48} />
                    <h2 className="text-xl font-bold text-(--text) mb-2">Diagnostic Failure</h2>
                    <p className="text-(--text-muted) mb-6">{error || "Could not retrieve system data."}</p>
                    <button onClick={refetch} className="btn btn-primary w-full shadow-lg">Retry Connection</button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full bg-(--bg) overflow-y-auto p-6 md:p-8 lg:p-12 custom-scrollbar">
            <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-7xl mx-auto"
            >
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                    <div className="flex items-center gap-6">
                        <Link 
                            href="/" 
                            className="w-10 h-10 rounded-xl bg-(--surface) border border-(--border-subtle) flex items-center justify-center text-(--text-muted) hover:text-(--text) hover:border-(--accent) transition-all shadow-sm"
                        >
                            <ArrowLeft size={18} />
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold text-(--text) tracking-tight flex items-center gap-3">
                                Platform <span className="text-(--accent)">Observability</span>
                            </h1>
                            <p className="text-(--text-muted) text-sm mt-1">Real-time infrastructure and reverse proxy diagnostics.</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4 bg-(--surface) border border-(--border-subtle) rounded-2xl px-6 py-3 shadow-sm">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] text-(--text-muted) uppercase font-bold tracking-widest leading-tight">Uptime</span>
                            <span className="text-sm font-mono text-(--text) font-semibold">
                                {Math.floor(status.uptime.process / 3600)}h {Math.floor((status.uptime.process % 3600) / 60)}m
                            </span>
                        </div>
                        <div className="h-8 w-px bg-(--border-subtle) mx-2" />
                        <Activity className="text-(--success) animate-pulse-slow" size={20} />
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
                    {/* CPU Load */}
                    <MetricCard 
                        icon={<Cpu className="text-blue-400" size={24} />}
                        title="CPU Load"
                        value={`${(status.system.loadAvg[0]).toFixed(2)}`}
                        subtitle="1min average"
                        extra={`${(status.system.loadAvg[1]).toFixed(2)} (5m) • ${(status.system.loadAvg[2]).toFixed(2)} (15m)`}
                    />
                    {/* Memory Usage */}
                    <MetricCard 
                        icon={<Memory className="text-purple-400" size={24} />}
                        title="Memory (RSS)"
                        value={status.memory.rss}
                        subtitle={`Heap: ${status.memory.heapUsed} / ${status.memory.heapTotal}`}
                        extra={`Free System: ${status.system.freeMem} / ${status.system.totalMem}`}
                    />
                    {/* Networking */}
                    <MetricCard 
                        icon={<Globe className="text-(--accent)" size={24} />}
                        title="Connectivity"
                        value={diagnostics.protocol.toUpperCase()}
                        subtitle={`Host: ${diagnostics.host}`}
                        extra={`IP: ${diagnostics.ip || "Direct Access"}`}
                    />
                </div>

                {/* Two Column Section */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                    {/* Environment Flags (L) */}
                    <div className="lg:col-span-2 flex flex-col gap-8">
                        <section className="bg-(--surface) border border-(--border-subtle) rounded-3xl p-8 shadow-xl relative overflow-hidden group isolate">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-(--accent) opacity-5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform" />
                            <h3 className="text-lg font-bold text-(--text) mb-6 flex items-center gap-2">
                                <Shield size={18} className="text-(--accent)" /> Runtime Environment
                            </h3>
                            <div className="space-y-5">
                                <InfoItem label="Auth Trust Host" value={diagnostics.env_flags.AUTH_TRUST_HOST} active={diagnostics.env_flags.AUTH_TRUST_HOST === 'true'} />
                                <InfoItem label="Hugging Face Space" value={diagnostics.env_flags.SPACE_ID} />
                                <InfoItem label="Node Environment" value={diagnostics.env_flags.NODE_ENV} />
                                <InfoItem label="Process Host" value={diagnostics.env_flags.HOSTNAME} />
                            </div>
                        </section>

                        <section className="bg-linear-to-br from-(--accent)/10 to-transparent border border-(--accent)/20 rounded-3xl p-8 shadow-sm">
                            <h3 className="text-sm font-bold text-(--text) mb-4 opacity-70 flex items-center gap-2 uppercase tracking-widest">
                                <Clock size={14} /> Refresh Cycle
                            </h3>
                            <p className="text-sm text-(--text-muted) leading-relaxed">
                                Diagnostic data is automatically refreshed every <span className="font-bold text-(--text)">10 seconds</span>. This view monitors active session persistence and reverse proxy stability for Hugging Face Spaces.
                            </p>
                        </section>
                    </div>

                    {/* Proxy Header Inspector (R) */}
                    <div className="lg:col-span-3">
                        <section className="bg-(--surface) border border-(--border-subtle) rounded-3xl h-full shadow-xl overflow-hidden flex flex-col">
                            <div className="p-8 border-b border-(--border-subtle) flex items-center justify-between">
                                <h3 className="text-lg font-bold text-(--text) flex items-center gap-2">
                                    <Server size={18} className="text-blue-400" /> Header Inspector
                                </h3>
                                <div className="text-[10px] bg-(--bg) px-3 py-1 rounded-full border border-(--border-subtle) font-mono text-(--text-muted)">
                                    {Object.keys(diagnostics.headers).length} keys detected
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-(--bg-2)/40">
                                <div className="space-y-3">
                                    {Object.entries(diagnostics.headers).map(([key, value]) => (
                                        <div key={key} className="flex flex-col gap-1 p-3 rounded-xl bg-(--surface) border border-(--border-subtle) hover:border-(--accent)/30 transition-colors shadow-sm">
                                            <span className="text-[10px] font-bold text-(--accent) uppercase tracking-wider font-mono">{key}</span>
                                            <span className="text-xs text-(--text) font-mono break-all">{value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

function MetricCard({ icon, title, value, subtitle, extra }: { icon: React.ReactNode, title: string, value: string, subtitle: string, extra?: string }) {
    return (
        <div className="bg-(--surface) border border-(--border-subtle) p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-all group scale-100 hover:scale-[1.02]">
            <div className="flex items-center gap-4 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-(--bg) border border-(--border-subtle) flex items-center justify-center group-hover:border-(--accent)/50 transition-colors shadow-inner">
                    {icon}
                </div>
                <h3 className="text-sm font-bold text-(--text-muted) uppercase tracking-widest">{title}</h3>
            </div>
            <div className="space-y-4">
                <div className="text-3xl font-bold text-(--text) tracking-tight">{value}</div>
                <div>
                    <div className="text-sm font-medium text-(--text)">{subtitle}</div>
                    {extra && <div className="text-xs text-(--text-muted) mt-1 font-mono opacity-80">{extra}</div>}
                </div>
            </div>
        </div>
    );
}

function InfoItem({ label, value, active }: { label: string, value: string, active?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-(--bg-2) border border-(--border-subtle) shadow-inner-sm">
            <span className="text-xs font-bold text-(--text-muted) uppercase tracking-wider">{label}</span>
            <div className="flex items-center gap-2">
                {active && <span className="w-2 h-2 rounded-full bg-(--success) animate-pulse shadow-[0_0_8px_var(--success)]" />}
                <span className={`text-sm font-mono font-medium ${active ? "text-(--success-foreground)" : "text-(--text)"}`}>
                    {value || "Not Set"}
                </span>
            </div>
        </div>
    );
}

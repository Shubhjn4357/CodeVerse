import SystemStatus from "@/components/dashboard/SystemStatus";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "System Observability | CodeVerse Studio",
    description: "Monitor platform infrastructure, reverse proxy diagnostics, and system health in real-time.",
};

export default function SystemStatusPage() {
    return (
        <main className="h-screen w-screen overflow-hidden bg-(--bg)">
            <SystemStatus />
        </main>
    );
}

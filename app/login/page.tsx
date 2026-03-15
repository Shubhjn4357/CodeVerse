"use client";

import { signIn } from "next-auth/react";
import { Github, Code2, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function LoginPage() {
    return (
        <div className="min-h-screen bg-(--bg) flex flex-col items-center justify-center p-6 relative overflow-hidden">

            {/* Ambient Background Glow */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-(--accent) rounded-full mix-blend-multiply filter blur-[128px] opacity-10 animate-pulse-accent pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-10 animate-pulse-accent pointer-events-none" style={{ animationDelay: '1s' }} />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="max-w-md w-full relative z-10"
            >
                <div className="bg-(--surface) border border-(--border-subtle) rounded-3xl shadow-2xl p-10 text-center backdrop-blur-xl bg-opacity-80">

                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                        className="w-20 h-20 bg-gradient-to-br from-(--bg-2) to-(--surface-hover) border border-(--border) rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-inner"
                    >
                        <Code2 size={40} className="text-(--accent)" />
                    </motion.div>

                    <h1 className="text-3xl font-bold text-(--text) mb-3 tracking-tight">CodeVerse <span className="text-(--text-muted) font-normal">Studio</span></h1>
                    <p className="text-(--text-muted) text-[15px] mb-10 leading-relaxed">
                        The fully managed, agentic VS Code environment running securely in the browser.
                    </p>

                    <button
                        onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
                        className="group w-full flex items-center justify-between bg-(--text) text-(--bg) hover:bg-opacity-90 font-semibold py-4 px-6 rounded-2xl transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5"
                    >
                        <div className="flex items-center gap-3">
                            <Github size={20} />
                            <span>Continue with GitHub</span>
                        </div>
                        <ArrowRight size={18} className="opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                    </button>

                    <div className="mt-8 text-xs text-(--text-muted) flex flex-col gap-2">
                        <p>Powered by highly scalable containerized VS Code engines.</p>
                        <div className="flex items-center justify-center gap-4 text-[11px] opacity-70">
                            <a href="#" className="hover:text-(--text) transition-colors">Terms of Service</a>
                            <span>&bull;</span>
                            <a href="#" className="hover:text-(--text) transition-colors">Privacy Policy</a>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

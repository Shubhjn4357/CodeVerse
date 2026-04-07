"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * 🎨 CodeVerse Skeleton Component
 * A premium, animated loading placeholder for enhanced perceived performance.
 * Uses Framer Motion for smooth pulse animations and CSS variables for theme-aware colors.
 * Adheres to UI/UX standards for a 'Studio-grade' platform.
 */

interface SkeletonProps {
    className?: string;
    variant?: "pulse" | "shimmer";
}

export function Skeleton({ className, variant = "pulse" }: SkeletonProps) {
    if (variant === "shimmer") {
        return (
            <div 
                className={cn(
                    "relative overflow-hidden bg-(--surface-hover) rounded-md",
                    className
                )}
            >
                <motion.div
                    initial={{ x: "-100%" }}
                    animate={{ x: "100%" }}
                    transition={{
                        repeat: Infinity,
                        duration: 1.5,
                        ease: "linear",
                    }}
                    className="absolute inset-0 bg-linear-to-r from-transparent via-(--accent)/10 to-transparent"
                />
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0.5 }}
            animate={{ opacity: [0.5, 0.8, 0.5] }}
            transition={{
                repeat: Infinity,
                duration: 2,
                ease: "easeInOut",
            }}
            className={cn("bg-(--surface-hover) rounded-md", className)}
        />
    );
}

/**
 * 🎨 Workspace Card Skeleton
 * Specialized skeleton for the workspace dashboard.
 */
export function WorkspaceSkeleton() {
    return (
        <div className="p-5 border border-(--border-subtle) rounded-2xl bg-(--surface) shadow-sm">
            <div className="flex items-center gap-4 mb-4">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4 rounded-md" />
                    <Skeleton className="h-4 w-1/2 rounded-md" />
                </div>
            </div>
            <div className="flex gap-2">
                <Skeleton className="h-9 flex-1 rounded-xl" />
                <Skeleton className="h-9 w-20 rounded-xl" />
            </div>
        </div>
    );
}

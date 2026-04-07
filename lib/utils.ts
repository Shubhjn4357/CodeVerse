import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 🛠️ Tailwind Class Merger
 * A robust utility for intelligently merging Tailwind CSS classes.
 * Handles conditional classes (via clsx) and resolves conflicts (via tailwind-merge).
 * Standardizes UI development across the entire CodeVerse platform.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

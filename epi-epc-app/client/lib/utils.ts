import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("fr-FR");
  } catch {
    return value;
  }
}

export function formatMoney(value?: number | string | null) {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " MAD";
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

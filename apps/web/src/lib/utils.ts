import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatMoney(amount: number | string, currency = "ج.م"): string {
  return `${Number(amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** أول حرفين من الاسم للأفاتار — بيتجاهل الأقواس والرموز (مثلًا "حسين (أدمن)" → "حأ") */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}

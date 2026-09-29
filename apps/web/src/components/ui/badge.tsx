import { cn } from "@/lib/utils";
import type { LiveStatus } from "@/lib/attendance";

type Tone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";
const tones: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-muted",
  primary: "bg-primary-soft text-primary",
};

export function Badge({ tone = "neutral", dot, children, className }: { tone?: Tone; dot?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const statusMeta: Record<LiveStatus, { label: string; tone: Tone }> = {
  WORKING: { label: "يعمل الآن", tone: "success" },
  IDLE: { label: "خامل", tone: "danger" },
  ON_BREAK: { label: "في استراحة", tone: "warning" },
  OFFLINE: { label: "غير متصل", tone: "neutral" },
};

export function StatusBadge({ status }: { status: LiveStatus }) {
  const m = statusMeta[status];
  return (
    <Badge tone={m.tone} dot>
      {m.label}
    </Badge>
  );
}

export function Avatar({ name, status, size = 40 }: { name: string; status?: LiveStatus; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
  const dot = status && { WORKING: "bg-success", IDLE: "bg-idle", ON_BREAK: "bg-warning", OFFLINE: "bg-muted" }[status];
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span className="flex h-full w-full items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">{initials}</span>
      {dot && <span className={cn("absolute bottom-0 left-0 h-3 w-3 rounded-full border-2 border-surface", dot)} aria-hidden />}
    </span>
  );
}

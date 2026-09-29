"use client";

import { useTransition } from "react";
import { markAlertsRead } from "@/app/actions/alerts";
import { Button } from "@/components/ui/button";

export function MarkAllRead({ disabled }: { disabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="secondary" disabled={disabled || pending} onClick={() => start(() => markAlertsRead())}>
      تحديد الكل كمقروء
    </Button>
  );
}

export function MarkRead({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="text-xs text-muted hover:text-primary disabled:opacity-50" disabled={pending} onClick={() => start(() => markAlertsRead([id]))}>
      مقروء
    </button>
  );
}

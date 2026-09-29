"use client";

import { useState, useTransition } from "react";
import { Copy, Check } from "lucide-react";
import { resendAccessLink, setEmployeeActive } from "@/app/actions/employees";
import type { ActionState } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/field";

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <Input readOnly value={link} dir="ltr" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
      <Button
        type="button"
        variant="secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check size={16} /> : <Copy size={16} />}
        {copied ? "تم النسخ" : "نسخ"}
      </Button>
    </div>
  );
}

export function EmployeeActions({ userId, active, hasPassword }: { userId: string; active: boolean; hasPassword: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={pending || !active} onClick={() => start(async () => setState(await resendAccessLink(userId)))}>
          {hasPassword ? "رابط تعيين كلمة مرور جديدة" : "إعادة إرسال الدعوة"}
        </Button>
        <Button
          variant={active ? "danger" : "primary"}
          size="sm"
          disabled={pending}
          onClick={() => {
            if (active && !confirm("إيقاف الموظف هيسجّل خروجه ويقفل أي جلسة عمل مفتوحة. متأكد؟")) return;
            start(async () => {
              await setEmployeeActive(userId, !active);
              setState(null);
            });
          }}
        >
          {active ? "إيقاف الموظف" : "إعادة تفعيل الموظف"}
        </Button>
      </div>
      <FormMessage state={state} />
      {state?.link && <CopyLink link={state.link} />}
    </div>
  );
}

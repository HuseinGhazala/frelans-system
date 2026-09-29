"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { addAdjustment, approvePayroll, generatePayroll, removeAdjustment, reopenPayroll, setOvertime } from "@/app/actions/payroll";
import type { ActionState } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { useFormAction } from "@/components/ui/use-form-action";
import type { Adjustment } from "@/lib/payroll-calc";

function useAction() {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return { pending, state, run: (fn: () => Promise<ActionState>) => start(async () => setState(await fn())) };
}

export function PeriodActions({ year, month, periodId, status }: { year: number; month: number; periodId: string | null; status: "DRAFT" | "APPROVED" | null }) {
  const { pending, state, run } = useAction();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status !== "APPROVED" && (
          <Button variant={periodId ? "secondary" : "primary"} disabled={pending} onClick={() => run(() => generatePayroll(year, month))}>
            {periodId ? "إعادة الحساب من الحضور" : "احسب مسودة الشهر"}
          </Button>
        )}
        {periodId && status === "DRAFT" && (
          <Button disabled={pending} onClick={() => confirm("اعتماد مرتبات الشهر؟ الكشوف هتتقفل وتظهر للموظفين.") && run(() => approvePayroll(periodId))}>
            اعتماد مرتبات الشهر
          </Button>
        )}
        {periodId && status === "APPROVED" && (
          <Button variant="secondary" disabled={pending} onClick={() => confirm("إلغاء الاعتماد ورجوع الشهر مسودة؟") && run(() => reopenPayroll(periodId))}>
            إلغاء الاعتماد
          </Button>
        )}
      </div>
      <FormMessage state={state} />
    </div>
  );
}

export function OvertimeCell({ itemId, surplus, approved, locked }: { itemId: string; surplus: number; approved: number; locked: boolean }) {
  const [value, setValue] = useState(String(approved));
  const { pending, state, run } = useAction();
  if (surplus <= 0) return <span className="text-muted">—</span>;
  if (locked) return <span className="tabular-nums">{approved} / {surplus}</span>;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Input type="number" min={0} max={surplus} step={0.25} value={value} onChange={(e) => setValue(e.target.value)} className="h-8 w-20 px-2" dir="ltr" aria-label="ساعات الإضافي المعتمدة" />
        <span className="text-xs text-muted">/ {surplus}</span>
      </div>
      <div className="flex gap-1">
        <button className="text-xs text-primary hover:underline disabled:opacity-50" disabled={pending} onClick={() => run(() => setOvertime(itemId, Number(value)))}>
          حفظ
        </button>
        <button className="text-xs text-muted hover:underline disabled:opacity-50" disabled={pending} onClick={() => { setValue(String(surplus)); run(() => setOvertime(itemId, surplus)); }}>
          الكل
        </button>
      </div>
      {state?.error && <p className="text-xs text-danger">{state.error}</p>}
    </div>
  );
}

export function Adjustments({ itemId, items, locked, currency }: { itemId: string; items: Adjustment[]; locked: boolean; currency: string }) {
  const [state, action, pending] = useFormAction(addAdjustment.bind(null, itemId));
  const rm = useAction();
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-muted">مفيش تعديلات</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {items.map((a, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span>
                <span className={a.kind === "BONUS" ? "text-success" : "text-danger"}>
                  {a.kind === "BONUS" ? "+" : "−"} {a.amount.toLocaleString("en-US")} {currency}
                </span>{" "}
                <span className="text-muted">{a.reason}</span>
              </span>
              {!locked && (
                <button className="rounded p-1 text-muted hover:text-danger" disabled={rm.pending} onClick={() => rm.run(() => removeAdjustment(itemId, i))} aria-label="حذف">
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!locked && (
        <form onSubmit={action} className="flex flex-wrap gap-2">
          <Select name="kind" className="h-9 w-28">
            <option value="BONUS">مكافأة</option>
            <option value="DEDUCTION">خصم</option>
          </Select>
          <Input name="amount" type="number" min={0} step="0.01" placeholder="المبلغ" className="h-9 w-28" dir="ltr" required />
          <Input name="reason" placeholder="السبب" className="h-9 min-w-32 flex-1" required />
          <Button size="sm" disabled={pending}>إضافة</Button>
        </form>
      )}
      <FormMessage state={state?.fieldErrors ? { error: Object.values(state.fieldErrors).flat()[0] } : state} />
    </div>
  );
}

export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()} className="print:hidden">
      طباعة / حفظ PDF
    </Button>
  );
}

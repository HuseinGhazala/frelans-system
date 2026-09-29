"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { cancelLeave, requestLeave, reviewLeave } from "@/app/actions/leaves";
import type { ActionState } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { useFormAction } from "@/components/ui/use-form-action";

const TYPES = [
  ["ANNUAL", "سنوية"],
  ["CASUAL", "عارضة"],
  ["SICK", "مرضية"],
  ["UNPAID", "بدون مرتب"],
] as const;

export function LeaveRequestForm({ today }: { today: string }) {
  const [state, action, pending] = useFormAction(requestLeave);
  const ref = useRef<HTMLFormElement>(null);
  const [type, setType] = useState("ANNUAL");
  useEffect(() => {
    if (state?.success) ref.current?.reset();
  }, [state]);
  const e = state?.fieldErrors ?? {};
  return (
    <form ref={ref} onSubmit={action} className="space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="نوع الإجازة" htmlFor="type" error={e.type}>
          <Select id="type" name="type" value={type} onChange={(ev) => setType(ev.target.value)}>
            {TYPES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
        </Field>
        <Field label="من" htmlFor="startDate" error={e.startDate}>
          <Input id="startDate" name="startDate" type="date" min={type === "SICK" ? undefined : today} required />
        </Field>
        <Field label="إلى" htmlFor="endDate" error={e.endDate}>
          <Input id="endDate" name="endDate" type="date" min={type === "SICK" ? undefined : today} required />
        </Field>
      </div>
      <Field label="السبب (اختياري)" htmlFor="reason">
        <Input id="reason" name="reason" maxLength={500} />
      </Field>
      <p className="text-xs text-muted">الإجازة الأسبوعية والرسمية جوه الفترة ما بتتحسبش من الرصيد.</p>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>{pending ? "جاري الإرسال..." : "إرسال الطلب"}</Button>
    </form>
  );
}

export function CancelLeaveButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" size="sm" className="text-danger" disabled={pending} onClick={() => confirm("إلغاء الطلب؟") && start(() => cancelLeave(id))}>
      إلغاء
    </Button>
  );
}

export function ReviewLeave({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState<ActionState>(null);
  const act = (d: "APPROVED" | "REJECTED") => start(async () => setState(await reviewLeave(id, d, note)));
  if (state?.success) return <FormMessage state={state} />;
  return (
    <div className="space-y-2">
      {rejecting ? (
        <div className="flex flex-wrap gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="سبب الرفض" className="min-w-48 flex-1" autoFocus />
          <Button variant="danger" size="sm" disabled={pending || !note.trim()} onClick={() => act("REJECTED")}>تأكيد الرفض</Button>
          <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>رجوع</Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" disabled={pending} onClick={() => act("APPROVED")}>موافقة</Button>
          <Button variant="secondary" size="sm" className="text-danger" disabled={pending} onClick={() => setRejecting(true)}>رفض</Button>
        </div>
      )}
      <FormMessage state={state} />
    </div>
  );
}

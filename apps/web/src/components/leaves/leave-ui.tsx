"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { adminCancelLeave, adminCreateLeave, cancelLeave, requestLeave, reviewLeave } from "@/app/actions/leaves";
import type { ActionState } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { useFormAction } from "@/components/ui/use-form-action";

function addDaysKey(key: string, days: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** نوع واحد بس: عارضة/مرضية (12 يوم في السنة، 3 في الشهر بالكتير) */
const LEAVE_HINT = "عارضة أو مرضية — 12 يوم في السنة، وبحد أقصى 3 أيام في الشهر";

export function LeaveRequestForm({ today }: { today: string }) {
  const [state, action, pending] = useFormAction(requestLeave);
  const ref = useRef<HTMLFormElement>(null);
  // ممكن تتسجل بأثر رجعي لحد 30 يوم (طوارئ أو مرض)
  const minDate = addDaysKey(today, -30);
  useEffect(() => {
    if (state?.success) ref.current?.reset();
  }, [state]);
  const e = state?.fieldErrors ?? {};
  return (
    <form ref={ref} onSubmit={action} className="space-y-4 p-5">
      <p className="text-sm text-muted">{LEAVE_HINT}. ينفع تسجلها بعد ما تحصل لحد 30 يوم.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="type" value="CASUAL" />
        <Field label="من" htmlFor="startDate" error={e.startDate}>
          <Input id="startDate" name="startDate" type="date" min={minDate} required />
        </Field>
        <Field label="إلى" htmlFor="endDate" error={e.endDate}>
          <Input id="endDate" name="endDate" type="date" min={minDate} required />
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

/** الأدمن بيسجّل إجازة لموظف (بتتقبل على طول) */
export function AdminLeaveForm({ employees, today }: { employees: { id: string; name: string }[]; today: string }) {
  const [state, action, pending] = useFormAction(adminCreateLeave);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.success) ref.current?.reset();
  }, [state]);
  const e = state?.fieldErrors ?? {};
  return (
    <form ref={ref} onSubmit={action} className="space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الموظف" htmlFor="userId" error={e.userId}>
          <Select id="userId" name="userId" defaultValue="" required>
            <option value="" disabled>
              اختار الموظف
            </option>
            {employees.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </Field>
        <input type="hidden" name="type" value="CASUAL" />
        <p className="self-end pb-2 text-xs text-muted">{LEAVE_HINT}، ومن رصيد الموظف.</p>
        <Field label="من" htmlFor="admin-start" error={e.startDate}>
          <Input id="admin-start" name="startDate" type="date" defaultValue={today} required />
        </Field>
        <Field label="إلى" htmlFor="admin-end" error={e.endDate}>
          <Input id="admin-end" name="endDate" type="date" defaultValue={today} required />
        </Field>
      </div>
      <Field label="السبب (اختياري)" htmlFor="admin-reason">
        <Input id="admin-reason" name="reason" maxLength={500} />
      </Field>
      <p className="text-xs text-muted">الإجازة بتتسجل مقبولة على طول، وبيوصل للموظف إيميل. ينفع بأثر رجعي (مثلًا يوم غاب فيه وعايز تحسبه عارضة).</p>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending}>{pending ? "جاري التسجيل..." : "تسجيل الإجازة"}</Button>
    </form>
  );
}

/** الأدمن بيلغي إجازة مقبولة (لازم سبب) */
export function AdminCancelLeave({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState<ActionState>(null);
  if (state?.success) return <FormMessage state={state} />;
  return (
    <div className="space-y-2">
      {open ? (
        <div className="flex flex-wrap gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="سبب الإلغاء" className="min-w-48 flex-1" autoFocus />
          <Button variant="danger" size="sm" disabled={pending || !note.trim()} onClick={() => start(async () => setState(await adminCancelLeave(id, note)))}>
            تأكيد الإلغاء
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>رجوع</Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="text-danger" onClick={() => setOpen(true)}>إلغاء الإجازة</Button>
      )}
      <FormMessage state={state} />
    </div>
  );
}

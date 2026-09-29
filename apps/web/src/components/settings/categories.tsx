"use client";

import { useEffect, useRef, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteAppCategory, setAppCategory } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { useFormAction } from "@/components/ui/use-form-action";
import { CATEGORY_LABEL, type Category } from "@/lib/productivity";

const CATS: Category[] = ["PRODUCTIVE", "NEUTRAL", "UNPRODUCTIVE"];
const TONE: Record<Category, string> = {
  PRODUCTIVE: "border-success text-success bg-success-soft",
  NEUTRAL: "border-border text-muted bg-surface-2",
  UNPRODUCTIVE: "border-danger text-danger bg-danger-soft",
};

function quickSet(name: string, category: Category) {
  const fd = new FormData();
  fd.set("name", name);
  fd.set("category", category);
  return setAppCategory(null, fd);
}

export function CategoriesManager({ rules, unclassified }: { rules: { id: string; pattern: string; category: Category }[]; unclassified: { name: string; minutes: number }[] }) {
  const [state, action, pending] = useFormAction(setAppCategory);
  const [busy, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <div className="space-y-6">
      {unclassified.length > 0 && (
        <Card>
          <CardHeader title="ظهرت مؤخرًا ولسه ما اتصنفتش" description="آخر 30 يوم — اللي مش متصنف بيتحسب محايد" />
          <ul className="divide-y divide-border">
            {unclassified.map((u) => (
              <li key={u.name} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span>
                  <span className="font-medium" dir="auto">{u.name}</span>
                  <span className="mr-2 text-xs text-muted">{Math.round(u.minutes / 60)} ساعة</span>
                </span>
                <span className="flex gap-1.5">
                  {CATS.map((c) => (
                    <button key={c} disabled={busy} onClick={() => start(async () => void (await quickSet(u.name, c)))} className={`rounded-md border px-2.5 py-1 text-xs ${TONE[c]} disabled:opacity-50`}>
                      {CATEGORY_LABEL[c]}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="تصنيف البرامج والمواقع" description="الإنتاجية = الوقت على البرامج والمواقع المنتجة ÷ وقت العمل المتتبع. الموقع له أولوية على المتصفح." />
        <form ref={formRef} onSubmit={action} className="flex flex-wrap items-end gap-3 border-b border-border p-5">
          <Field label="اسم البرنامج أو الموقع" htmlFor="cname" error={state?.fieldErrors?.name} className="min-w-52 flex-1">
            <Input id="cname" name="name" dir="ltr" placeholder="مثلاً: figma أو youtube.com" required />
          </Field>
          <Field label="التصنيف" htmlFor="ccat">
            <Select id="ccat" name="category" defaultValue="PRODUCTIVE" className="w-36">
              {CATS.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={pending}>إضافة</Button>
        </form>
        <div className="px-5 pt-3"><FormMessage state={state?.success ? null : state} /></div>
        <ul className="divide-y divide-border">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
              <span className="font-medium" dir="ltr">{r.pattern}</span>
              <span className="flex items-center gap-1.5">
                {CATS.map((c) => (
                  <button
                    key={c}
                    disabled={busy || r.category === c}
                    onClick={() => start(async () => void (await quickSet(r.pattern, c)))}
                    className={`rounded-md border px-2 py-0.5 text-xs ${r.category === c ? TONE[c] : "border-transparent text-muted hover:bg-surface-2"}`}
                  >
                    {CATEGORY_LABEL[c]}
                  </button>
                ))}
                <button className="mr-2 rounded p-1.5 text-muted hover:bg-danger-soft hover:text-danger" disabled={busy} onClick={() => start(() => deleteAppCategory(r.id))} aria-label={`حذف ${r.pattern}`}>
                  <Trash2 size={15} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

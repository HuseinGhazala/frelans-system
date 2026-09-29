"use client";

import { useEffect, useRef } from "react";
import { changePassword } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { useFormAction } from "@/components/ui/use-form-action";

export function ChangePasswordForm() {
  const [state, action, pending] = useFormAction(changePassword);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.success) ref.current?.reset();
  }, [state]);
  const e = state?.fieldErrors ?? {};
  return (
    <Card className="max-w-lg">
      <CardHeader title="تغيير كلمة المرور" description="8 حروف على الأقل، فيها حرف إنجليزي ورقم" />
      <form ref={ref} onSubmit={action} className="space-y-4 p-5">
        <Field label="كلمة المرور الحالية" htmlFor="current" error={e.current}>
          <Input id="current" name="current" type="password" dir="ltr" autoComplete="current-password" required />
        </Field>
        <Field label="كلمة المرور الجديدة" htmlFor="password" error={e.password}>
          <Input id="password" name="password" type="password" dir="ltr" autoComplete="new-password" required />
        </Field>
        <Field label="تأكيد كلمة المرور الجديدة" htmlFor="confirm" error={e.confirm}>
          <Input id="confirm" name="confirm" type="password" dir="ltr" autoComplete="new-password" required />
        </Field>
        <FormMessage state={state?.fieldErrors ? null : state} />
        <Button type="submit" disabled={pending}>{pending ? "جاري الحفظ..." : "حفظ كلمة المرور"}</Button>
      </form>
    </Card>
  );
}

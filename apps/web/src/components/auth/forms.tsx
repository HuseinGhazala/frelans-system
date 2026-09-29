"use client";

import { useFormAction } from "@/components/ui/use-form-action";
import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { login, requestPasswordReset, setPassword, setupAdmin } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";

function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? "text" : "password"} className="pl-10" dir="ltr" {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 left-0 flex w-10 items-center justify-center text-muted hover:text-text"
        aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function LoginForm() {
  const [state, action, pending] = useFormAction(login);
  return (
    <form onSubmit={action} className="space-y-4">
      <FormMessage state={state} />
      <Field label="البريد الإلكتروني" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" dir="ltr" required />
      </Field>
      <Field label="كلمة المرور" htmlFor="password">
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </Field>
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm text-primary hover:underline">
          نسيت كلمة المرور؟
        </Link>
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "جاري الدخول..." : "دخول"}
      </Button>
    </form>
  );
}

export function SetupForm() {
  const [state, action, pending] = useFormAction(setupAdmin);
  const e = state?.fieldErrors ?? {};
  return (
    <form onSubmit={action} className="space-y-4">
      <FormMessage state={state} />
      <Field label="اسم الشركة" htmlFor="companyName" error={e.companyName}>
        <Input id="companyName" name="companyName" required />
      </Field>
      <Field label="اسمك" htmlFor="name" error={e.name}>
        <Input id="name" name="name" autoComplete="name" required />
      </Field>
      <Field label="البريد الإلكتروني" htmlFor="email" error={e.email}>
        <Input id="email" name="email" type="email" autoComplete="email" dir="ltr" required />
      </Field>
      <Field label="كلمة المرور" htmlFor="password" error={e.password} hint="8 حروف على الأقل، فيها حرف إنجليزي ورقم">
        <PasswordInput id="password" name="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "جاري الإنشاء..." : "إنشاء حساب المدير"}
      </Button>
    </form>
  );
}

export function SetPasswordForm({ token, submitLabel }: { token: string; submitLabel: string }) {
  const [state, action, pending] = useFormAction(setPassword);
  const e = state?.fieldErrors ?? {};
  return (
    <form onSubmit={action} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <Field label="كلمة المرور الجديدة" htmlFor="password" error={e.password} hint="8 حروف على الأقل، فيها حرف إنجليزي ورقم">
        <PasswordInput id="password" name="password" autoComplete="new-password" required />
      </Field>
      <Field label="تأكيد كلمة المرور" htmlFor="confirm" error={e.confirm}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "جاري الحفظ..." : submitLabel}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useFormAction(requestPasswordReset);
  return (
    <form onSubmit={action} className="space-y-4">
      <FormMessage state={state} />
      <Field label="البريد الإلكتروني" htmlFor="email">
        <Input id="email" name="email" type="email" dir="ltr" required />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        إرسال رابط الاستعادة
      </Button>
      <Link href="/login" className="block text-center text-sm text-primary hover:underline">
        رجوع لتسجيل الدخول
      </Link>
    </form>
  );
}

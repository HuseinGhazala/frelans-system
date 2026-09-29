import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/auth/forms";

export const metadata: Metadata = { title: "نسيت كلمة المرور" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-bold">نسيت كلمة المرور؟</h1>
      <p className="mb-6 mt-1 text-sm text-muted">اكتب بريدك وهنبعتلك رابط لتعيين كلمة مرور جديدة</p>
      <ForgotPasswordForm />
    </>
  );
}

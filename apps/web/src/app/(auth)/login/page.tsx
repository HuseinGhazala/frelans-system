import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/forms";
import { getCurrentUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin" : "/me");
  return (
    <>
      <h1 className="text-2xl font-bold">تسجيل الدخول</h1>
      <p className="mb-6 mt-1 text-sm text-muted">ادخل ببريدك الإلكتروني وكلمة المرور</p>
      <LoginForm />
    </>
  );
}

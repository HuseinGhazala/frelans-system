import type { Metadata } from "next";
import Link from "next/link";
import { SetPasswordForm } from "@/components/auth/forms";
import { findValidToken } from "@/lib/auth/tokens";

export const metadata: Metadata = { title: "تعيين كلمة مرور" };

export default async function Page({ params }: PageProps<"/reset/[token]">) {
  const { token } = await params;
  const row = await findValidToken(token);
  if (!row) {
    return (
      <>
        <h1 className="text-2xl font-bold">الرابط غير صالح</h1>
        <p className="mb-6 mt-2 text-sm text-muted">الرابط ده انتهت صلاحيته أو اتستخدم قبل كده. اطلب رابط جديد من المدير.</p>
        <Link href="/login" className="text-sm text-primary hover:underline">رجوع لتسجيل الدخول</Link>
      </>
    );
  }
  return (
    <>
      <h1 className="text-2xl font-bold">كلمة مرور جديدة</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{row.user.name} — <span dir="ltr">{row.user.email}</span><br />اكتب كلمة المرور الجديدة</p>
      <SetPasswordForm token={token} submitLabel="حفظ" />
    </>
  );
}

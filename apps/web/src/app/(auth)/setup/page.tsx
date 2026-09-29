import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SetupForm } from "@/components/auth/forms";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "الإعداد الأول" };

export default async function SetupPage() {
  await connection();
  if ((await db.user.count()) > 0) redirect("/login");
  return (
    <>
      <h1 className="text-2xl font-bold">أهلاً بيك في راصد</h1>
      <p className="mb-6 mt-1 text-sm text-muted">اعمل حساب المدير عشان تبدأ تضيف الموظفين</p>
      <SetupForm />
    </>
  );
}

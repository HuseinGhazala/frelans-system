import type { Metadata } from "next";
import { ChangePasswordForm } from "@/components/account/change-password";
import { PageHeader } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "حسابي" };

export default async function AccountPage() {
  const user = await requireAdmin();
  return (
    <>
      <PageHeader title="حسابي" description={user.email} />
      <ChangePasswordForm />
    </>
  );
}

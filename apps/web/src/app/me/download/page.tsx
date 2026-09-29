import type { Metadata } from "next";
import { Download } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { requireEmployee } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "تحميل البرنامج" };

export default async function DownloadPage() {
  const user = await requireEmployee();
  const url = process.env.AGENT_DOWNLOAD_URL;
  const server = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return (
    <>
      <PageHeader title="تحميل برنامج راصد" description="البرنامج بيسجل حضورك ونشاطك وانت شغال على الكمبيوتر" />
      <Card>
        <CardHeader title="Windows" />
        <div className="space-y-4 p-5 text-sm">
          {url ? (
            <a href={url} className={buttonClass("primary", "lg")}>
              <Download size={18} /> تحميل البرنامج لـ Windows
            </a>
          ) : (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-warning">رابط التحميل لسه ما اتضافش — اطلبه من المدير.</p>
          )}
          <ol className="list-decimal space-y-2 pr-5">
            <li>شغّل الملف اللي نزل. لو Windows ظهر تحذير (SmartScreen) اضغط <b>More info</b> وبعدين <b>Run anyway</b>.</li>
            <li>
              ادخل بنفس الإيميل وكلمة المرور بتوع الموقع (<span dir="ltr">{user.email}</span>).
              {server && (
                <>
                  {" "}
                  ولو طلب رابط السيرفر اكتب: <span dir="ltr" className="font-mono">{server}</span>
                </>
              )}
            </li>
            <li>اقرا شاشة الموافقة ووافق عليها.</li>
            <li>اضغط <b>تسجيل حضور</b> لما تبدأ شغل، و<b>استراحة</b> لما تقوم، و<b>تسجيل انصراف</b> لما تخلص.</li>
          </ol>
          <p className="text-muted">البرنامج بيفتح تلقائي مع Windows وبيفضل في شريط المهام جنب الساعة. التتبع بيشتغل بس وانت مسجل حضور.</p>
        </div>
      </Card>
    </>
  );
}

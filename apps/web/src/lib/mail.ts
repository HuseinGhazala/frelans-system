import "server-only";
import nodemailer from "nodemailer";
import { getSettings } from "./settings";

export async function isMailConfigured(): Promise<boolean> {
  const { smtp } = await getSettings();
  return Boolean(smtp.host && smtp.from);
}

/** بيرجع false لو الإيميل مش متظبط أو الإرسال فشل — الموقع يكمل عادي ويعرض الرابط للأدمن */
export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const { smtp } = await getSettings();
  if (!smtp.host || !smtp.from) return false;
  try {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
    });
    await transport.sendMail({ from: smtp.from, to, subject, html: `<div dir="rtl" style="font-family:Tahoma,Arial">${html}</div>` });
    return true;
  } catch (err) {
    console.error("sendMail failed", err);
    return false;
  }
}

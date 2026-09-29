import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "rased_session";

/** فحص سريع: لو مفيش كوكي جلسة نحوّل على صفحة الدخول. الفحص الحقيقي بيتم في كل صفحة (lib/auth/dal). */
export function proxy(request: NextRequest) {
  if (!request.cookies.has(SESSION_COOKIE)) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/me/:path*"],
};

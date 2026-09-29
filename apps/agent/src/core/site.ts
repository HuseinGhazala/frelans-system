/**
 * استخراج اسم الموقع من نافذة المتصفح.
 * على macOS بنجيب الـ URL نفسه. على Windows مفيش URL، فبناخد اسم الموقع من عنوان التبويب
 * (أغلب المواقع بتحط اسمها في آخر العنوان: "Inbox - Gmail"، "Video - YouTube").
 */
const BROWSERS = [
  /chrome/i,
  /msedge|microsoft edge/i,
  /firefox/i,
  /brave/i,
  /opera/i,
  /vivaldi/i,
  /safari/i,
  /arc/i,
  /yandex/i,
];

const BROWSER_SUFFIX = /\s[-—–]\s(Google Chrome|Microsoft​? Edge|Mozilla Firefox|Brave|Opera|Vivaldi|Safari|Arc)$/i;
const EDGE_PROFILE = /\s[-—–]\s(Personal|Work|Profile \d+)$/i;

export function isBrowser(app: string): boolean {
  return BROWSERS.some((r) => r.test(app));
}

export function hostFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

export function siteFromTitle(title: string): string | null {
  let t = title.trim().replace(BROWSER_SUFFIX, "").replace(EDGE_PROFILE, "").replace(BROWSER_SUFFIX, "").trim();
  if (!t || /^(new tab|علامة تبويب جديدة|untitled)$/i.test(t)) return null;
  // عدد الإشعارات في أول العنوان: "(3) Inbox - Gmail"
  t = t.replace(/^\(\d+\+?\)\s*/, "");
  const parts = t.split(/\s[-—–|·•]\s/).map((p) => p.trim()).filter(Boolean);
  const site = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  return site ? site.slice(0, 100) : null;
}

export function siteOf(app: string, title: string, url?: string): string | null {
  if (url) return hostFromUrl(url);
  if (!isBrowser(app)) return null;
  return siteFromTitle(title);
}

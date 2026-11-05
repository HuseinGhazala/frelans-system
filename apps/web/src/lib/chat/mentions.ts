/**
 * المنشن جوه نص الرسالة بيتكتب كده: @[الاسم](userId)
 * العميل بيحوّله لشكل مميز في العرض، والسيرفر بيطلع منه الـ ids ويتأكد إنهم أعضاء.
 * client-safe.
 */
export const MENTION_RE = /@\[([^\]\n]{1,80})\]\(([a-z0-9]{10,40})\)/g;

export function extractMentionIds(body: string): string[] {
  const ids = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) ids.add(m[2]);
  return [...ids];
}

/** النص من غير صيغة المنشن (للإشعارات والإيميل والمعاينة): @الاسم */
export function plainText(body: string): string {
  return body.replace(MENTION_RE, (_, name: string) => `@${name}`);
}

export function mentionToken(name: string, userId: string): string {
  return `@[${name.replace(/[\]\n]/g, "")}](${userId})`;
}

export type Category = "PRODUCTIVE" | "NEUTRAL" | "UNPRODUCTIVE";

/** "Code.exe" → "code"، "WWW.GitHub.com" → "github.com" */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\.exe$/, "").replace(/^www\./, "");
}

/**
 * تصنيف دقيقة نشاط: الموقع له أولوية على البرنامج (المتصفح نفسه محايد، لكن يوتيوب غير منتج).
 * اللي مش متصنف بيتحسب محايد.
 */
export function classify(rules: Map<string, Category>, app: string | null, domain: string | null): Category {
  if (domain) {
    const d = normalizeName(domain);
    const hit = rules.get(d) ?? rules.get(d.split(".")[0]);
    if (hit) return hit;
  }
  if (app) {
    const hit = rules.get(normalizeName(app));
    if (hit) return hit;
  }
  return "NEUTRAL";
}

export function isClassified(rules: Map<string, Category>, name: string) {
  return rules.has(normalizeName(name));
}

export const CATEGORY_LABEL: Record<Category, string> = {
  PRODUCTIVE: "منتج",
  NEUTRAL: "محايد",
  UNPRODUCTIVE: "غير منتج",
};

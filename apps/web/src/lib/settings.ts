import "server-only";
import { db } from "./db";
import { SETTINGS_SECTIONS, settingsSchema, type Settings, type SettingsSection } from "./settings-schema";

export async function getSettings(): Promise<Settings> {
  const rows = await db.setting.findMany({ where: { key: { in: SETTINGS_SECTIONS } } });
  const raw = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const parsed = settingsSchema.safeParse(raw);
  // لو في قيمة قديمة مش صالحة نرجع للافتراضي بدل ما الموقع يقع
  return parsed.success ? parsed.data : settingsSchema.parse({});
}

export async function saveSettingsSection<K extends SettingsSection>(key: K, value: Settings[K]) {
  const valid = settingsSchema.shape[key].parse(value);
  await db.setting.upsert({
    where: { key },
    create: { key, value: valid },
    update: { value: valid },
  });
}

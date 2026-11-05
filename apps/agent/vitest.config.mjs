import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // macOS على الشير بيعمل ملفات ._* — مش اختبارات
    exclude: [...configDefaults.exclude, "**/._*"],
  },
});

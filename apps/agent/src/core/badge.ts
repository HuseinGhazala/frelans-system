/**
 * بيرسم نقطة حمرا (علامة رسايل جديدة) في ركن صورة BGRA — لأيقونة شريط المهام.
 * من غير Electron عشان يتختبر. البيكسلات اللي برّه الدايرة ما بتتغيرش.
 */
export function drawBadgeDot(bitmap: Uint8Array, width: number, height: number, opts: { color?: [number, number, number]; ratio?: number } = {}): Uint8Array {
  const out = new Uint8Array(bitmap);
  if (width <= 0 || height <= 0 || out.length < width * height * 4) return out;
  const [r, g, b] = opts.color ?? [220, 38, 38];
  const radius = Math.max(2, Math.round(Math.min(width, height) * (opts.ratio ?? 0.22)));
  // الركن اللي فوق على اليمين
  const cx = width - radius - 0.5;
  const cy = radius - 0.5;
  for (let y = 0; y < Math.min(height, radius * 2 + 1); y++) {
    for (let x = Math.max(0, width - radius * 2 - 1); x < width; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const i = (y * width + x) * 4;
      if (d <= radius - 0.5) {
        out[i] = b;
        out[i + 1] = g;
        out[i + 2] = r;
        out[i + 3] = 255;
      } else if (d <= radius + 0.6) {
        // حواف بيضا عشان النقطة تبان على أي خلفية
        out[i] = 255;
        out[i + 1] = 255;
        out[i + 2] = 255;
        out[i + 3] = 255;
      }
    }
  }
  return out;
}

/** دايرة حمرا لوحدها (Overlay على أيقونة البرنامج في شريط المهام) */
export function badgeCircle(size: number): Uint8Array {
  return drawBadgeDot(new Uint8Array(size * size * 4), size, size, { ratio: 0.5 });
}

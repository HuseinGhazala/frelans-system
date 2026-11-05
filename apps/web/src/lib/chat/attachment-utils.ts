/**
 * أدوات مرفقات الشات (pure — من غير أي import من السيرفر) عشان تتختبر وتتستخدم في المتصفح كمان.
 */
import type { AttachmentKind } from "./types";

export const MAX_FILENAME_LENGTH = 150;
/** أقصى مدة للرسالة الصوتية (التسجيل بيقف عند 5 دقايق) */
export const MAX_VOICE_SECONDS = 5 * 60;

/** امتدادات ممنوعة: برامج وسكريبتات */
export const BLOCKED_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "com", "msi", "scr", "ps1", "vbs", "js", "jar", "sh", "apk", "dll",
  // نفس الخطورة
  "msp", "pif", "hta", "wsf", "vbe", "jse", "cpl", "reg", "lnk", "mjs", "cjs", "psm1", "app", "deb", "rpm",
]);

const BLOCKED_MIMES = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-ms-installer",
  "application/x-msi",
  "application/x-dosexec",
  "application/x-executable",
  "application/vnd.microsoft.portable-executable",
  "application/x-bat",
  "application/x-sh",
  "application/x-shellscript",
  "text/x-shellscript",
  "application/javascript",
  "application/x-javascript",
  "text/javascript",
  "application/ecmascript",
  "text/ecmascript",
  "application/java-archive",
  "application/x-java-archive",
  "application/vnd.android.package-archive",
  "application/hta",
  "text/vbscript",
  "application/x-powershell",
]);

/** أنواع ممكن المتصفح يشغّل فيها كود — بتتبعت دايمًا كتحميل octet-stream */
const ACTIVE_MIMES = new Set(["text/html", "application/xhtml+xml", "image/svg+xml", "text/xml", "application/xml", "text/xsl"]);

/** "image/PNG; charset=x" → "image/png"، ولو مش شكل mime سليم → application/octet-stream */
export function normalizeMime(mime: string | null | undefined): string {
  const m = (mime ?? "").split(";")[0]!.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(m) ? m : "application/octet-stream";
}

/** امتداد الملف بحروف صغيرة من غير النقطة ("" لو مفيش) */
export function extOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 && i < base.length - 1 ? base.slice(i + 1).toLowerCase() : "";
}

/** ملف تنفيذي أو سكريبت؟ (بالامتداد أو النوع) */
export function isBlockedFile(name: string, mime: string): boolean {
  return BLOCKED_EXTENSIONS.has(extOf(name)) || BLOCKED_MIMES.has(normalizeMime(mime));
}

/** محتوى برنامج (Windows PE أو Linux ELF) بغض النظر عن الاسم */
export function looksExecutable(buf: Uint8Array): boolean {
  if (buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a) return true; // MZ
  return buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46; // \x7fELF
}

export function isActiveMime(mime: string): boolean {
  const m = normalizeMime(mime);
  return ACTIVE_MIMES.has(m) || m.endsWith("+xml") || BLOCKED_MIMES.has(m);
}

/**
 * تنضيف اسم الملف: بيسيب العربي، بيشيل المسار والحروف الممنوعة وحروف التحكم واتجاه النص (RLO spoofing)،
 * وبيقصّه لـ 150 حرف مع الحفاظ على الامتداد.
 */
export function sanitizeFilename(input: string, max = MAX_FILENAME_LENGTH): string {
  let name = (input ?? "").normalize("NFC");
  name = name.split(/[\\/]/).pop() ?? "";
  name = name
    // حروف التحكم + علامات اتجاه النص اللي بتستخدم للتمويه (fdp.exe)
    .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  if (!name) return "file";
  const chars = Array.from(name);
  if (chars.length <= max) return name;
  const ext = extOf(name);
  if (ext && ext.length <= 10) {
    const base = Array.from(name.slice(0, name.length - ext.length - 1)).slice(0, max - ext.length - 1).join("").trimEnd();
    return `${base}.${ext}`;
  }
  return chars.slice(0, max).join("").trimEnd();
}

export type SniffedImage = { mime: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; width: number | null; height: number | null };

const u16be = (b: Uint8Array, i: number) => (b[i]! << 8) | b[i + 1]!;
const u16le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8);
const u24le = (b: Uint8Array, i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i]! << 24) >>> 0) + ((b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
const dims = (w: number, h: number) => (w > 0 && h > 0 && w <= 100_000 && h <= 100_000 ? { width: w, height: h } : { width: null, height: null });

/** بيعرف الصورة من أول bytes (png/jpeg/gif/webp) ويقرا الأبعاد من الـ header. null = مش صورة من دول */
export function sniffImage(b: Uint8Array): SniffedImage | null {
  if (b.length >= 24 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) {
    return { mime: "image/png", ...(ascii(b, 12, 4) === "IHDR" ? dims(u32be(b, 16), u32be(b, 20)) : dims(0, 0)) };
  }
  if (b.length >= 10 && (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a")) {
    return { mime: "image/gif", ...dims(u16le(b, 6), u16le(b, 8)) };
  }
  if (b.length >= 16 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") {
    const chunk = ascii(b, 12, 4);
    let d = dims(0, 0);
    if (chunk === "VP8 " && b.length >= 30) d = dims(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
    else if (chunk === "VP8L" && b.length >= 25 && b[20] === 0x2f) {
      const [b0, b1, b2, b3] = [b[21]!, b[22]!, b[23]!, b[24]!];
      d = dims(1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)));
    } else if (chunk === "VP8X" && b.length >= 30) d = dims(1 + u24le(b, 24), 1 + u24le(b, 27));
    return { mime: "image/webp", ...d };
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { mime: "image/jpeg", ...jpegDims(b) };
  }
  return null;
}

function jpegDims(b: Uint8Array): { width: number | null; height: number | null } {
  let i = 2;
  let orientation = 1;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) break;
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // نهاية / بداية الصورة نفسها
    const len = u16be(b, i + 2);
    if (len < 2) break;
    if (marker === 0xe1 && ascii(b, i + 4, 6) === "Exif\0\0") orientation = exifOrientation(b, i + 10, i + 2 + len) ?? orientation;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && i + 9 <= b.length) {
      const h = u16be(b, i + 5);
      const w = u16be(b, i + 7);
      // الاتجاهات 5-8 معناها الصورة بتتلف 90 درجة وهي بتتعرض
      return orientation >= 5 && orientation <= 8 ? dims(h, w) : dims(w, h);
    }
    i += 2 + len;
  }
  return { width: null, height: null };
}

function exifOrientation(b: Uint8Array, start: number, end: number): number | null {
  end = Math.min(end, b.length);
  if (start + 8 > end) return null;
  const order = ascii(b, start, 2);
  if (order !== "II" && order !== "MM") return null;
  const le = order === "II";
  const r16 = (i: number) => (le ? u16le(b, i) : u16be(b, i));
  const r32 = (i: number) => (le ? (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16)) + b[i + 3]! * 0x1000000 : u32be(b, i));
  const ifd = start + r32(start + 4);
  if (ifd + 2 > end) return null;
  const count = r16(ifd);
  for (let k = 0; k < count; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > end) return null;
    if (r16(e) === 0x0112) return r16(e + 8);
  }
  return null;
}

/** صيغ الصوت اللي بنقبلها كرسالة صوتية (من أول bytes) */
export function sniffAudio(b: Uint8Array): string | null {
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "audio/webm";
  if (b.length >= 4 && ascii(b, 0, 4) === "OggS") return "audio/ogg";
  if (b.length >= 12 && ascii(b, 4, 4) === "ftyp") return "audio/mp4";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WAVE") return "audio/wav";
  if (b.length >= 3 && ascii(b, 0, 3) === "ID3") return "audio/mpeg";
  if (b.length >= 2 && b[0] === 0xff && (b[1]! & 0xe0) === 0xe0) return "audio/mpeg";
  return null;
}

/**
 * نوع المرفق ونوع المحتوى اللي هيتخزن:
 * - صورة png/jpeg/gif/webp (متأكدين منها بالـ bytes) → IMAGE. SVG أو صورة مش معروفة → FILE.
 * - kind = VOICE ونوع صوت فعلًا → VOICE.
 * - غير كده FILE.
 */
export function detectKind(input: {
  mime: string;
  requested?: AttachmentKind;
  image?: SniffedImage | null;
  audio?: string | null;
}): { kind: AttachmentKind; mime: string } {
  const mime = normalizeMime(input.mime);
  if (input.image) return { kind: "IMAGE", mime: input.image.mime };
  if (input.requested === "VOICE" && (input.audio || mime.startsWith("audio/") || mime === "video/webm")) {
    return { kind: "VOICE", mime: input.audio && !mime.startsWith("audio/") ? input.audio : mime === "video/webm" ? "audio/webm" : mime };
  }
  // ادّعى إنه صورة بس الـ bytes مش صورة نعرفها: بيتخزن كملف عادي
  if (mime.startsWith("image/") && mime !== "image/svg+xml") return { kind: "FILE", mime: "application/octet-stream" };
  return { kind: "FILE", mime };
}

/** يتعرض جوه الصفحة؟ (صور raster وصوت بس) */
export function isInlineMime(mime: string): boolean {
  const m = normalizeMime(mime);
  return ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(m) || (m.startsWith("audio/") && !isActiveMime(m));
}

/** الـ content-type اللي بيتبعت: الأنواع اللي ممكن تشغّل كود بتتبعت octet-stream */
export function servedContentType(mime: string): string {
  const m = normalizeMime(mime);
  return isActiveMime(m) ? "application/octet-stream" : m;
}

function encodeRfc5987(s: string) {
  return encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Content-Disposition فيه اسم ASCII احتياطي + filename* (RFC 5987/6266) للأسماء العربي */
export function contentDisposition(type: "inline" | "attachment", filename: string): string {
  const name = sanitizeFilename(filename);
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\%]/g, "_") || "file";
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeRfc5987(name)}`;
}

/** Range: bytes=a-b (range واحد بس). null = مفيش/مش مدعوم (ابعت الملف كله)، "invalid" = 416 */
export function parseRange(header: string | null | undefined, size: number): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, a, z] = m;
  if (a === "" && z === "") return null;
  let start: number;
  let end: number;
  if (a === "") {
    const suffix = Number(z);
    if (suffix === 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(a);
    end = z === "" ? size - 1 : Math.min(Number(z), size - 1);
  }
  if (start >= size || start > end) return "invalid";
  return { start, end };
}

/** 1536 → "1.5 ك.ب" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} ك.ب`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} م.ب`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} ج.ب`;
}

/** 75 → "1:15" */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

import { describe, expect, it } from "vitest";
import {
  contentDisposition,
  detectKind,
  extOf,
  formatBytes,
  formatClock,
  isBlockedFile,
  isInlineMime,
  looksExecutable,
  normalizeMime,
  parseRange,
  sanitizeFilename,
  servedContentType,
  sniffAudio,
  sniffImage,
} from "./attachment-utils";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? Array.from(p, (c) => c.charCodeAt(0)) : p)));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >>> 8) & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];

function png(w: number, h: number) {
  return bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a], be32(13), "IHDR", be32(w), be32(h), [8, 6, 0, 0, 0]);
}
function jpeg(w: number, h: number, orientation?: number) {
  const app0 = bytes([0xff, 0xe0], be16(16), "JFIF", [0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  let app1 = new Uint8Array();
  if (orientation) {
    // TIFF little-endian, IFD0 فيه entry واحدة: Orientation
    const tiff = bytes("II", [0x2a, 0], [8, 0, 0, 0], le16(1), le16(0x0112), le16(3), [1, 0, 0, 0], le16(orientation), [0, 0], [0, 0, 0, 0]);
    app1 = bytes([0xff, 0xe1], be16(2 + 6 + tiff.length), "Exif", [0, 0], Array.from(tiff));
  }
  const sof = bytes([0xff, 0xc0], be16(17), [8], be16(h), be16(w), [3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return bytes([0xff, 0xd8], Array.from(app0), Array.from(app1), Array.from(sof), [0xff, 0xda, 0, 2]);
}

describe("sniffImage", () => {
  it("reads PNG dimensions", () => {
    expect(sniffImage(png(640, 480))).toEqual({ mime: "image/png", width: 640, height: 480 });
  });
  it("reads GIF dimensions", () => {
    expect(sniffImage(bytes("GIF89a", le16(320), le16(200), [0, 0, 0]))).toEqual({ mime: "image/gif", width: 320, height: 200 });
  });
  it("reads JPEG dimensions, swapping for EXIF rotation", () => {
    expect(sniffImage(jpeg(1920, 1080))).toEqual({ mime: "image/jpeg", width: 1920, height: 1080 });
    expect(sniffImage(jpeg(1920, 1080, 6))).toEqual({ mime: "image/jpeg", width: 1080, height: 1920 });
    expect(sniffImage(jpeg(1920, 1080, 3))).toEqual({ mime: "image/jpeg", width: 1920, height: 1080 });
  });
  it("reads WebP VP8, VP8L and VP8X dimensions", () => {
    const vp8 = bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8 ", [0, 0, 0, 0], [0, 0, 0], [0x9d, 0x01, 0x2a], le16(800), le16(600));
    expect(sniffImage(vp8)).toEqual({ mime: "image/webp", width: 800, height: 600 });
    // VP8L: 14-bit (w-1), 14-bit (h-1)
    const w = 400 - 1;
    const h = 300 - 1;
    const bits = w | (h << 14);
    const vp8l = bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8L", [0, 0, 0, 0], [0x2f], [bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255]);
    expect(sniffImage(vp8l)).toEqual({ mime: "image/webp", width: 400, height: 300 });
    const vp8x = bytes("RIFF", [0, 0, 0, 0], "WEBP", "VP8X", [10, 0, 0, 0], [0, 0, 0, 0], le24(1023), le24(767));
    expect(sniffImage(vp8x)).toEqual({ mime: "image/webp", width: 1024, height: 768 });
  });
  it("returns null for non-images and svg", () => {
    expect(sniffImage(bytes("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(sniffImage(bytes("<html>"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
  it("keeps the type but drops nonsense dimensions on truncated headers", () => {
    expect(sniffImage(bytes([0xff, 0xd8, 0xff]))).toEqual({ mime: "image/jpeg", width: null, height: null });
  });
});

describe("sniffAudio / looksExecutable", () => {
  it("detects recorder containers", () => {
    expect(sniffAudio(bytes([0x1a, 0x45, 0xdf, 0xa3, 0]))).toBe("audio/webm");
    expect(sniffAudio(bytes([0, 0, 0, 0x20], "ftypM4A ", [0]))).toBe("audio/mp4");
    expect(sniffAudio(bytes("OggS"))).toBe("audio/ogg");
    expect(sniffAudio(bytes("hello"))).toBeNull();
  });
  it("spots PE and ELF binaries", () => {
    expect(looksExecutable(bytes("MZ", [0x90, 0]))).toBe(true);
    expect(looksExecutable(bytes([0x7f], "ELF"))).toBe(true);
    expect(looksExecutable(bytes("%PDF-1.7"))).toBe(false);
  });
});

describe("detectKind", () => {
  it("IMAGE only when bytes are a known raster image", () => {
    expect(detectKind({ mime: "image/png", image: { mime: "image/png", width: 1, height: 1 } })).toEqual({ kind: "IMAGE", mime: "image/png" });
    // الامتداد بيقول jpg بس المحتوى png: نصدق المحتوى
    expect(detectKind({ mime: "image/jpeg", image: { mime: "image/png", width: 1, height: 1 } })).toEqual({ kind: "IMAGE", mime: "image/png" });
    expect(detectKind({ mime: "image/png", image: null })).toEqual({ kind: "FILE", mime: "application/octet-stream" });
  });
  it("svg is a FILE", () => {
    expect(detectKind({ mime: "image/svg+xml" })).toEqual({ kind: "FILE", mime: "image/svg+xml" });
  });
  it("VOICE only when requested and audio", () => {
    expect(detectKind({ mime: "audio/webm;codecs=opus", requested: "VOICE", audio: "audio/webm" })).toEqual({ kind: "VOICE", mime: "audio/webm" });
    expect(detectKind({ mime: "audio/mpeg" })).toEqual({ kind: "FILE", mime: "audio/mpeg" });
    expect(detectKind({ mime: "application/pdf", requested: "VOICE" })).toEqual({ kind: "FILE", mime: "application/pdf" });
    expect(detectKind({ mime: "", requested: "VOICE", audio: "audio/mp4" })).toEqual({ kind: "VOICE", mime: "audio/mp4" });
  });
  it("normalizes odd mimes", () => {
    expect(normalizeMime("Application/PDF; charset=x")).toBe("application/pdf");
    expect(normalizeMime("not a mime")).toBe("application/octet-stream");
    expect(normalizeMime(undefined)).toBe("application/octet-stream");
  });
});

describe("isBlockedFile", () => {
  it.each(["setup.exe", "run.BAT", "x.cmd", "a.com", "i.msi", "s.scr", "p.ps1", "v.vbs", "app.js", "lib.jar", "go.sh", "a.apk", "x.dll"])("blocks %s", (name) => {
    expect(isBlockedFile(name, "application/octet-stream")).toBe(true);
  });
  it("blocks by mime", () => {
    expect(isBlockedFile("readme", "application/x-msdownload")).toBe(true);
    expect(isBlockedFile("readme", "text/javascript")).toBe(true);
  });
  it("allows documents, including double extensions that end safely", () => {
    expect(isBlockedFile("تقرير.pdf", "application/pdf")).toBe(false);
    expect(isBlockedFile("backup.exe.zip", "application/zip")).toBe(false);
    expect(isBlockedFile("data.json", "application/json")).toBe(false);
  });
  it("extOf ignores dotfiles and trailing dots", () => {
    expect(extOf(".bashrc")).toBe("");
    expect(extOf("a.TXT")).toBe("txt");
    expect(extOf("dir.x/file")).toBe("");
  });
});

describe("sanitizeFilename", () => {
  it("keeps Arabic and strips paths", () => {
    expect(sanitizeFilename("C:\\Users\\me\\تقرير الشهر.pdf")).toBe("تقرير الشهر.pdf");
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
  });
  it("removes control and bidi-override characters", () => {
    expect(sanitizeFilename("invoice\u202Efdp.exe")).toBe("invoicefdp.exe");
    expect(sanitizeFilename("a\u0000b\nc.txt")).toBe("abc.txt");
  });
  it("replaces reserved characters and trims dots/spaces", () => {
    expect(sanitizeFilename('  ..a<b>:"c"|?*.txt.. ')).toBe("a_b___c____.txt");
    expect(sanitizeFilename("...")).toBe("file");
    expect(sanitizeFilename("")).toBe("file");
  });
  it("caps at 150 characters and keeps the extension", () => {
    const out = sanitizeFilename(`${"ملف".repeat(100)}.docx`);
    expect(Array.from(out).length).toBe(150);
    expect(out.endsWith(".docx")).toBe(true);
  });
  it("does not split surrogate pairs", () => {
    const out = sanitizeFilename("😀".repeat(200));
    expect(Array.from(out).length).toBe(150);
    expect(out).toBe("😀".repeat(150));
  });
});

describe("contentDisposition", () => {
  it("encodes Arabic names with RFC 5987 and an ASCII fallback", () => {
    expect(contentDisposition("attachment", "تقرير.pdf")).toBe(
      `attachment; filename="_____.pdf"; filename*=UTF-8''${encodeURIComponent("تقرير")}.pdf`,
    );
  });
  it("escapes quotes and special characters", () => {
    const v = contentDisposition("inline", "it's (final)*.png");
    expect(v).toBe(`inline; filename="it's (final)_.png"; filename*=UTF-8''it%27s%20%28final%29_.png`);
    expect(contentDisposition("attachment", 'a"b%.txt')).toBe(`attachment; filename="a_b_.txt"; filename*=UTF-8''a_b%25.txt`);
  });
});

describe("serving rules", () => {
  it("only raster images and audio are inline", () => {
    expect(isInlineMime("image/png")).toBe(true);
    expect(isInlineMime("audio/webm")).toBe(true);
    expect(isInlineMime("image/svg+xml")).toBe(false);
    expect(isInlineMime("text/html")).toBe(false);
    expect(isInlineMime("application/pdf")).toBe(false);
  });
  it("active content is served as octet-stream", () => {
    expect(servedContentType("text/html")).toBe("application/octet-stream");
    expect(servedContentType("image/svg+xml")).toBe("application/octet-stream");
    expect(servedContentType("application/rss+xml")).toBe("application/octet-stream");
    expect(servedContentType("application/pdf")).toBe("application/pdf");
  });
});

describe("parseRange", () => {
  it("parses single ranges", () => {
    expect(parseRange("bytes=0-1", 100)).toEqual({ start: 0, end: 1 });
    expect(parseRange("bytes=10-", 100)).toEqual({ start: 10, end: 99 });
    expect(parseRange("bytes=-20", 100)).toEqual({ start: 80, end: 99 });
    expect(parseRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 });
  });
  it("ignores missing/multi ranges and rejects unsatisfiable ones", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseRange("bytes=100-", 100)).toBe("invalid");
    expect(parseRange("bytes=5-2", 100)).toBe("invalid");
  });
});

describe("formatting", () => {
  it("formats sizes and clock", () => {
    expect(formatBytes(500)).toBe("500 بايت");
    expect(formatBytes(1536)).toBe("1.5 ك.ب");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 م.ب");
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(0)).toBe("0:00");
  });
});

import { useEffect, useRef, useState } from "react";
import type { RasedApi } from "../preload";

/**
 * المرفقات: الـ main بيجيب الملف بالتوكن، وهنا بنعمل منه blob: URL (الـ CSP بيسمح بـ blob: للصور والصوت بس).
 * كاش صغير عشان نفس الصورة ما تتحملش كل مرة.
 */
const MAX_CACHED = 120;
const cache = new Map<string, Promise<string>>();

export function attachmentUrl(api: RasedApi["chat"], id: string): Promise<string> {
  const hit = cache.get(id);
  if (hit) {
    cache.delete(id);
    cache.set(id, hit); // الأحدث استخدامًا في الآخر
    return hit;
  }
  const p = api.attachment(id).then(({ mime, data }) => URL.createObjectURL(new Blob([new Uint8Array(data)], { type: mime })));
  cache.set(id, p);
  p.catch(() => cache.delete(id));
  while (cache.size > MAX_CACHED) {
    const [oldId, oldP] = cache.entries().next().value as [string, Promise<string>];
    cache.delete(oldId);
    void oldP.then((u) => URL.revokeObjectURL(u)).catch(() => {});
  }
  return p;
}

export function useAttachmentUrl(api: RasedApi["chat"], id: string, enabled = true) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    attachmentUrl(api, id).then(
      (u) => alive && setUrl(u),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [api, id, enabled]);
  return { url, error };
}

/** تسجيل رسالة صوتية (MediaRecorder). الـ main بيسمح بالميكروفون لشباكنا بس */
export const MAX_VOICE_SEC = 5 * 60;

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; startedAt: number; timer: ReturnType<typeof setInterval> } | null>(null);

  const cleanup = () => {
    const r = rec.current;
    if (!r) return;
    clearInterval(r.timer);
    for (const t of r.stream.getTracks()) t.stop();
    rec.current = null;
    setRecording(false);
    setElapsed(0);
  };

  useEffect(() => cleanup, []);

  const start = async () => {
    if (rec.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((m) => MediaRecorder.isTypeSupported(m));
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : undefined);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const sec = (Date.now() - startedAt) / 1000;
      setElapsed(sec);
      if (sec >= MAX_VOICE_SEC && mr.state === "recording") mr.stop();
    }, 250);
    rec.current = { mr, stream, chunks, startedAt, timer };
    mr.start(1000);
    setRecording(true);
  };

  /** بيوقف ويرجّع التسجيل (أو null لو أقل من ثانية) */
  const stop = () =>
    new Promise<{ blob: Blob; durationSec: number } | null>((resolve) => {
      const r = rec.current;
      if (!r) return resolve(null);
      const durationSec = (Date.now() - r.startedAt) / 1000;
      const finish = () => {
        const blob = new Blob(r.chunks, { type: r.mr.mimeType || "audio/webm" });
        cleanup();
        resolve(durationSec < 1 || blob.size === 0 ? null : { blob, durationSec: Math.round(durationSec) });
      };
      if (r.mr.state === "inactive") finish();
      else {
        r.mr.onstop = finish;
        r.mr.stop();
      }
    });

  const cancel = () => {
    const r = rec.current;
    if (r && r.mr.state !== "inactive") {
      r.mr.onstop = null;
      r.mr.stop();
    }
    cleanup();
  };

  return { recording, elapsed, start, stop, cancel };
}

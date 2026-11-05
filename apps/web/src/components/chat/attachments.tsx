"use client";

/* eslint-disable @next/next/no-img-element -- المرفقات بتتعرض من /api/chat/attachments بعد التأكد من الصلاحية، مش من next/image */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  LoaderCircle,
  Mic,
  Paperclip,
  Pause,
  Play,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { MAX_VOICE_SECONDS, extOf, formatBytes, formatClock, isBlockedFile } from "@/lib/chat/attachment-utils";
import { MAX_ATTACHMENTS_PER_MESSAGE, type AttachmentKind, type ChatAttachment } from "@/lib/chat/types";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/**
 * [المرحلة 2 — الملفات والصوت] الواجهة المتفق عليها. اللي بيبني الشات (المرحلة 1) بيستخدمها كده بس.
 * الرفع: POST /api/chat/attachments (multipart: file, kind?, durationSec?) → ChatAttachment
 * العرض/التحميل: GET /api/chat/attachments/[id]
 */

export const attachmentUrl = (id: string, download = false) => `/api/chat/attachments/${encodeURIComponent(id)}${download ? "?download=1" : ""}`;

export type UploadOptions = {
  kind?: AttachmentKind;
  durationSec?: number;
  /** 0..100 */
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

/**
 * رفع ملف واحد للشات (بيستخدمه AttachmentButton و VoiceRecorderButton، وينفع للصق والسحب والإفلات).
 * بيرمي Error رسالته بالعربي جاهزة تتعرض.
 */
export function uploadChatFile(file: File, opts: UploadOptions = {}): Promise<ChatAttachment> {
  return new Promise((resolve, reject) => {
    if (isBlockedFile(file.name, file.type)) {
      reject(new Error("النوع ده من الملفات مش مسموح (برامج وسكريبتات)"));
      return;
    }
    if (opts.signal?.aborted) {
      reject(new Error("اتلغى الرفع"));
      return;
    }
    const form = new FormData();
    form.append("file", file, file.name);
    if (opts.kind) form.append("kind", opts.kind);
    if (opts.durationSec !== undefined) form.append("durationSec", String(Math.round(opts.durationSec)));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/chat/attachments");
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      const data = xhr.response as (ChatAttachment & { error?: string }) | null;
      if (xhr.status >= 200 && xhr.status < 300 && data?.id) {
        opts.onProgress?.(100);
        resolve(data);
        return;
      }
      const fallback =
        xhr.status === 413 ? "الملف كبير أوي" : xhr.status === 401 ? "سجّل دخول تاني" : xhr.status === 429 ? "رفعت ملفات كتير، استنى شوية" : "الرفع ما نجحش، جرب تاني";
      reject(new Error(data?.error || fallback));
    };
    xhr.onerror = () => reject(new Error("مفيش اتصال بالسيرفر، جرب تاني"));
    xhr.onabort = () => reject(new Error("اتلغى الرفع"));
    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

type UploadItem = { key: string; name: string; progress: number; error?: string };

/** حالة رفع كذا ملف مع progress وأخطاء بتختفي لوحدها — ممكن تستخدمها في اللصق/السحب كمان */
export function useChatUploader(onUploaded: (a: ChatAttachment) => void) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const dismissLater = useCallback((key: string, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t);
      setItems((list) => list.filter((i) => i.key !== key));
    }, ms);
    timers.current.add(t);
  }, []);

  const upload = useCallback(
    async (files: File[], opts: Omit<UploadOptions, "onProgress"> = {}) => {
      let list = files;
      const extra: UploadItem[] = [];
      if (list.length > MAX_ATTACHMENTS_PER_MESSAGE) {
        extra.push({ key: crypto.randomUUID(), name: "", progress: 0, error: `أقصى عدد ملفات في الرسالة ${MAX_ATTACHMENTS_PER_MESSAGE}` });
        list = list.slice(0, MAX_ATTACHMENTS_PER_MESSAGE);
      }
      const added = list.map((f) => ({ key: crypto.randomUUID(), name: f.name || "ملف", progress: 0 }));
      setItems((cur) => [...cur, ...extra, ...added]);
      extra.forEach((e) => dismissLater(e.key, 6000));

      await Promise.all(
        list.map(async (file, idx) => {
          const key = added[idx]!.key;
          try {
            const a = await uploadChatFile(file, {
              ...opts,
              onProgress: (p) => setItems((cur) => cur.map((i) => (i.key === key ? { ...i, progress: p } : i))),
            });
            setItems((cur) => cur.filter((i) => i.key !== key));
            onUploadedRef.current(a);
          } catch (err) {
            const error = err instanceof Error ? err.message : "الرفع ما نجحش";
            setItems((cur) => cur.map((i) => (i.key === key ? { ...i, error } : i)));
            dismissLater(key, 6000);
          }
        }),
      );
    },
    [dismissLater],
  );

  const dismiss = useCallback((key: string) => setItems((cur) => cur.filter((i) => i.key !== key)), []);
  return { items, upload, dismiss, busy: items.some((i) => !i.error) };
}

/** شريط الرفع والأخطاء اللي بيظهر فوق الزرار */
export function UploadStatus({ items, onDismiss, className }: { items: UploadItem[]; onDismiss: (key: string) => void; className?: string }) {
  if (!items.length) return null;
  return (
    <div className={cn("absolute bottom-full z-30 mb-2 w-72 max-w-[80vw] space-y-1.5 start-0", className)} aria-live="polite">
      {items.map((i) =>
        i.error ? (
          <div key={i.key} role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger shadow-sm">
            <span className="min-w-0 flex-1">
              {i.name && <span className="block truncate font-medium">{i.name}</span>}
              {i.error}
            </span>
            <button type="button" onClick={() => onDismiss(i.key)} aria-label="اقفل" className="shrink-0 rounded p-0.5 hover:bg-danger/10">
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <div key={i.key} className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text shadow-sm">
            <div className="mb-1 flex items-center gap-2">
              <LoaderCircle className="size-3.5 shrink-0 animate-spin text-primary" />
              <span className="min-w-0 flex-1 truncate">{i.name}</span>
              <span className="shrink-0 tabular-nums text-muted">{i.progress}%</span>
            </div>
            <Progress value={i.progress} className="h-1.5" />
          </div>
        ),
      )}
    </div>
  );
}

const iconButton =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** زرار اختيار ملف/صورة (أو أكتر). بيرفع ويرجع كل مرفق اترفع */
export function AttachmentButton({ onUploaded, disabled }: { onUploaded: (a: ChatAttachment) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { items, upload, dismiss } = useChatUploader(onUploaded);
  return (
    <div className="relative inline-flex">
      <button type="button" className={iconButton} disabled={disabled} onClick={() => inputRef.current?.click()} aria-label="إرفاق ملف أو صورة" title="إرفاق ملف أو صورة">
        <Paperclip className="size-5" />
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) void upload(files);
        }}
      />
      <UploadStatus items={items} onDismiss={dismiss} />
    </div>
  );
}

function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

type RecState = { phase: "idle" } | { phase: "recording"; startedAt: number } | { phase: "uploading"; progress: number };

/** زرار تسجيل صوت: ضغطة تبدأ، ضغطة تبعت. بيرفع الريكورد ويرجعه */
export function VoiceRecorderButton({ onUploaded, disabled }: { onUploaded: (a: ChatAttachment) => void; disabled?: boolean }) {
  const [state, setState] = useState<RecState>({ phase: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const sendOnStopRef = useRef(false);
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);

  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // اقفل المايك لو الكومبوننت اتشال وهو بيسجل
  useEffect(
    () => () => {
      sendOnStopRef.current = false;
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const finish = useCallback((send: boolean) => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    sendOnStopRef.current = send;
    rec.stop();
  }, []);

  // العداد + الوقف عند 5 دقايق
  useEffect(() => {
    if (state.phase !== "recording") return;
    const t = setInterval(() => {
      const sec = (Date.now() - state.startedAt) / 1000;
      setElapsed(sec);
      if (sec >= MAX_VOICE_SECONDS) finish(true);
    }, 250);
    return () => clearInterval(t);
  }, [state, finish]);

  async function start() {
    setError(null);
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("المتصفح ده مش بيدعم تسجيل الصوت");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setError(name === "NotAllowedError" || name === "SecurityError" ? "لازم تسمح للموقع يستخدم المايك" : name === "NotFoundError" ? "مفيش مايك متوصل" : "مقدرناش نشغّل المايك");
      return;
    }
    const mimeType = pickRecorderMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 48_000 } : undefined);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError("المتصفح ده مش بيدعم تسجيل الصوت");
      return;
    }
    streamRef.current = stream;
    recorderRef.current = rec;
    chunksRef.current = [];
    sendOnStopRef.current = false;
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      releaseMic();
      recorderRef.current = null;
      const durationSec = Math.min(MAX_VOICE_SECONDS, (Date.now() - startedRef.current) / 1000);
      const type = (rec.mimeType || mimeType || "audio/webm").split(";")[0]!;
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      if (!sendOnStopRef.current) {
        setState({ phase: "idle" });
        return;
      }
      if (durationSec < 0.7 || blob.size === 0) {
        setState({ phase: "idle" });
        setError("التسجيل قصير أوي");
        return;
      }
      const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
      const file = new File([blob], `رسالة صوتية.${ext}`, { type });
      setState({ phase: "uploading", progress: 0 });
      uploadChatFile(file, { kind: "VOICE", durationSec, onProgress: (progress) => setState({ phase: "uploading", progress }) })
        .then((a) => onUploadedRef.current(a))
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "الرفع ما نجحش"))
        .finally(() => setState({ phase: "idle" }));
    };
    rec.start(1000);
    startedRef.current = Date.now();
    setElapsed(0);
    setState({ phase: "recording", startedAt: startedRef.current });
  }

  const errorBox = error && (
    <div role="alert" className="absolute bottom-full z-30 mb-2 w-64 max-w-[80vw] rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger shadow-sm start-0">
      {error}
    </div>
  );

  if (state.phase === "recording") {
    const left = MAX_VOICE_SECONDS - elapsed;
    return (
      <div className="relative inline-flex h-10 items-center gap-1 rounded-lg border border-danger/30 bg-danger-soft ps-3 pe-1" role="group" aria-label="بيسجل">
        <span className="size-2.5 animate-pulse rounded-full bg-danger" aria-hidden />
        <span className={cn("min-w-11 text-center text-sm font-medium tabular-nums", left <= 30 ? "text-danger" : "text-text")} dir="ltr" aria-live="off">
          {formatClock(elapsed)}
        </span>
        <button type="button" className={cn(iconButton, "size-8 hover:bg-danger/10 hover:text-danger")} onClick={() => finish(false)} aria-label="إلغاء التسجيل" title="إلغاء">
          <Trash2 className="size-4" />
        </button>
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-lg bg-primary text-on-primary hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          onClick={() => finish(true)}
          aria-label="ابعت التسجيل"
          title="ابعت"
        >
          <Send className="size-4 -scale-x-100" />
        </button>
      </div>
    );
  }

  if (state.phase === "uploading") {
    return (
      <div className="relative inline-flex h-10 items-center gap-2 px-2 text-xs text-muted" aria-live="polite">
        <LoaderCircle className="size-4 animate-spin text-primary" />
        <span className="tabular-nums">{state.progress}%</span>
      </div>
    );
  }

  return (
    <div className="relative inline-flex">
      <button type="button" className={iconButton} disabled={disabled} onClick={() => void start()} aria-label="تسجيل رسالة صوتية" title="تسجيل رسالة صوتية">
        <Mic className="size-5" />
      </button>
      {errorBox}
    </div>
  );
}

type IconKey = "voice" | "image" | "audio" | "video" | "archive" | "sheet" | "doc" | "file";

function iconKeyFor(a: ChatAttachment): IconKey {
  const { mime, name } = a;
  const ext = extOf(name);
  if (a.kind === "VOICE") return "voice";
  if (a.kind === "IMAGE" || mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].includes(ext) || /zip|compressed|archive/.test(mime)) return "archive";
  if (["xls", "xlsx", "csv", "ods", "numbers"].includes(ext) || /spreadsheet|excel|csv/.test(mime)) return "sheet";
  if (["pdf", "doc", "docx", "txt", "rtf", "odt", "md", "ppt", "pptx"].includes(ext) || mime.startsWith("text/") || /pdf|word|document|presentation/.test(mime)) return "doc";
  return "file";
}

function AttachmentIcon({ a, className }: { a: ChatAttachment; className?: string }) {
  switch (iconKeyFor(a)) {
    case "voice":
      return <Mic className={className} aria-hidden />;
    case "image":
      return <FileImage className={className} aria-hidden />;
    case "audio":
      return <FileAudio className={className} aria-hidden />;
    case "video":
      return <FileVideo className={className} aria-hidden />;
    case "archive":
      return <FileArchive className={className} aria-hidden />;
    case "sheet":
      return <FileSpreadsheet className={className} aria-hidden />;
    case "doc":
      return <FileText className={className} aria-hidden />;
    default:
      return <FileIcon className={className} aria-hidden />;
  }
}

/** المرفقات اللي اترفعت ولسه ما اتبعتتش (فوق خانة الكتابة) مع زرار شيل */
export function PendingAttachments({ items, onRemove }: { items: ChatAttachment[]; onRemove: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="الملفات اللي هتتبعت">
      {items.map((a) => {
        return (
          <li key={a.id} className="group relative">
            {a.kind === "IMAGE" ? (
              <img src={attachmentUrl(a.id)} alt={a.name} className="size-16 rounded-lg border border-border bg-surface-2 object-cover" />
            ) : (
              <div className="flex h-16 max-w-56 items-center gap-2 rounded-lg border border-border bg-surface-2 ps-3 pe-7 text-xs">
                <AttachmentIcon a={a} className="size-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="truncate font-medium text-text">{a.kind === "VOICE" ? "رسالة صوتية" : a.name}</div>
                  <div className="text-muted tabular-nums">{a.kind === "VOICE" && a.durationSec != null ? formatClock(a.durationSec) : formatBytes(a.bytes)}</div>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => onRemove(a.id)}
              aria-label={`شيل ${a.name}`}
              title="شيل"
              className="absolute -top-1.5 -end-1.5 inline-flex size-6 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-sm hover:bg-danger hover:text-white focus-visible:outline-2 focus-visible:outline-primary"
            >
              <X className="size-3.5" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Lightbox({ images, index, onIndex, onClose }: { images: ChatAttachment[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const img = images[index]!;
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const many = images.length > 1;
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // RTL: السهم الشمال = اللي بعده
      else if (many && e.key === "ArrowLeft") onIndex((index + 1) % images.length);
      else if (many && e.key === "ArrowRight") onIndex((index - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [index, images.length, many, onClose, onIndex]);

  const navBtn = "absolute top-1/2 -translate-y-1/2 inline-flex size-11 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 focus-visible:outline-2 focus-visible:outline-white";
  return (
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-50 flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex items-center gap-2 p-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span id={titleId} className="min-w-0 flex-1 truncate text-sm">
          {img.name}
          {many && <span className="ms-2 text-white/60 tabular-nums">{`${index + 1} / ${images.length}`}</span>}
        </span>
        <a href={attachmentUrl(img.id, true)} download={img.name} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-white/10" aria-label="تحميل" title="تحميل">
          <Download className="size-5" />
        </a>
        <button ref={closeRef} type="button" onClick={onClose} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-white/10" aria-label="اقفل" title="اقفل">
          <X className="size-5" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        <img src={attachmentUrl(img.id)} alt={img.name} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
        {many && (
          <>
            <button type="button" className={cn(navBtn, "start-3")} aria-label="اللي قبلها" onClick={(e) => (e.stopPropagation(), onIndex((index - 1 + images.length) % images.length))}>
              <ChevronRight className="size-6" />
            </button>
            <button type="button" className={cn(navBtn, "end-3")} aria-label="اللي بعدها" onClick={(e) => (e.stopPropagation(), onIndex((index + 1) % images.length))}>
              <ChevronLeft className="size-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function VoicePlayer({ a, mine }: { a: ChatAttachment; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  // MediaRecorder بيعمل webm مدته Infinity، فبنعتمد على durationSec اللي اتبعتت مع الرفع
  const duration = a.durationSec && a.durationSec > 0 ? a.durationSec : (mediaDuration ?? 0);

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      // وقف أي صوت تاني شغال في الصفحة
      document.querySelectorAll("audio").forEach((o) => o !== el && o.pause());
      el.play().catch(() => setFailed(true));
    } else el.pause();
  }

  return (
    <div className={cn("flex w-64 max-w-full items-center gap-2 rounded-xl px-2 py-1.5", mine ? "bg-black/10" : "bg-surface-2")}>
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "إيقاف" : "تشغيل الرسالة الصوتية"}
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          mine ? "bg-on-primary text-primary" : "bg-primary text-on-primary",
        )}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 -scale-x-100" />}
      </button>
      <div className="min-w-0 flex-1" dir="ltr">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(current, duration || 1)}
          aria-label="مكان التشغيل"
          onChange={(e) => {
            const el = audioRef.current;
            const v = Number(e.target.value);
            if (el && Number.isFinite(v)) el.currentTime = v;
            setCurrent(v);
          }}
          className={cn("h-1 w-full cursor-pointer", mine ? "accent-current" : "accent-primary")}
        />
      </div>
      <span className={cn("shrink-0 text-xs tabular-nums", mine ? "opacity-80" : "text-muted")} dir="ltr">
        {failed ? "—" : playing || current > 0 ? formatClock(current) : formatClock(duration)}
      </span>
      <audio
        ref={audioRef}
        src={attachmentUrl(a.id)}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setMediaDuration(d);
        }}
        onError={() => setFailed(true)}
        className="hidden"
      />
    </div>
  );
}

function ExpiredRow({ a, mine }: { a: ChatAttachment; mine: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs", mine ? "border-current/30 opacity-80" : "border-border text-muted")}>
      <AttachmentIcon a={a} className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{a.kind === "VOICE" ? "رسالة صوتية" : a.name}</span>
        <span>الملف اتمسح بعد مدة الحفظ</span>
      </span>
    </div>
  );
}

/** عرض مرفقات رسالة: صور مصغرة (تكبر بالضغط)، مشغل صوت، وملفات بزرار تحميل. expired = "الملف اتمسح" */
export function MessageAttachments({ attachments, mine }: { attachments: ChatAttachment[]; mine: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const closeLightbox = useCallback(() => setOpen(null), []);
  if (!attachments.length) return null;

  const live = attachments.filter((a) => !a.expired);
  const expired = attachments.filter((a) => a.expired);
  const images = live.filter((a) => a.kind === "IMAGE");
  const voices = live.filter((a) => a.kind === "VOICE");
  const files = live.filter((a) => a.kind === "FILE");

  return (
    <div className="mt-1 flex max-w-full flex-col gap-1.5">
      {images.length === 1 && (
        <button type="button" onClick={() => setOpen(0)} className="block w-fit max-w-full overflow-hidden rounded-lg focus-visible:outline-2 focus-visible:outline-primary" aria-label={`كبّر ${images[0]!.name}`}>
          <img
            src={attachmentUrl(images[0]!.id)}
            alt={images[0]!.name}
            loading="lazy"
            width={images[0]!.width ?? undefined}
            height={images[0]!.height ?? undefined}
            className="block h-auto max-h-80 w-auto max-w-[min(20rem,100%)] bg-black/5 object-contain"
            style={images[0]!.width && images[0]!.height ? { aspectRatio: `${images[0]!.width} / ${images[0]!.height}` } : undefined}
          />
        </button>
      )}
      {images.length > 1 && (
        <div className="grid w-72 max-w-full grid-cols-2 gap-1">
          {images.slice(0, 4).map((img, i) => {
            const more = i === 3 && images.length > 4 ? images.length - 4 : 0;
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => setOpen(i)}
                className="relative aspect-square overflow-hidden rounded-lg bg-black/5 focus-visible:outline-2 focus-visible:outline-primary"
                aria-label={more ? `${more} صور كمان` : `كبّر ${img.name}`}
              >
                <img src={attachmentUrl(img.id)} alt={img.name} loading="lazy" className="size-full object-cover" />
                {more > 0 && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-semibold text-white">+{more}</span>}
              </button>
            );
          })}
        </div>
      )}

      {voices.map((a) => (
        <VoicePlayer key={a.id} a={a} mine={mine} />
      ))}

      {files.map((a) => {
        return (
          <a
            key={a.id}
            href={attachmentUrl(a.id, true)}
            download={a.name}
            className={cn(
              "flex w-72 max-w-full items-center gap-3 rounded-lg px-3 py-2 text-start transition-colors focus-visible:outline-2 focus-visible:outline-primary",
              mine ? "bg-black/10 hover:bg-black/15" : "border border-border bg-surface hover:bg-surface-2",
            )}
            title={`تحميل ${a.name}`}
          >
            <AttachmentIcon a={a} className={cn("size-8 shrink-0", mine ? "opacity-90" : "text-primary")} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium" dir="auto">
                {a.name}
              </span>
              <span className={cn("block text-xs tabular-nums", mine ? "opacity-75" : "text-muted")}>
                {formatBytes(a.bytes)}
                {extOf(a.name) && ` · ${extOf(a.name).toUpperCase()}`}
              </span>
            </span>
            <Download className="size-4 shrink-0 opacity-70" aria-hidden />
          </a>
        );
      })}

      {expired.map((a) => (
        <ExpiredRow key={a.id} a={a} mine={mine} />
      ))}

      {open !== null && images[open] && <Lightbox images={images} index={open} onIndex={setOpen} onClose={closeLightbox} />}
    </div>
  );
}

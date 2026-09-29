import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { Session, ShotMeta, ShotStore } from "../core/controller";
import type { QueueData, QueueStorage } from "../core/queue";
import type { ServerState, TaskRef } from "../core/types";

declare const __DEFAULT_SERVER_URL__: string;

const dir = () => app.getPath("userData");
const file = (name: string) => path.join(dir(), name);

function readJson<T>(name: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file(name), "utf8")) as T;
  } catch {
    return null;
  }
}

/** كتابة آمنة: ملف مؤقت وبعدين rename، عشان لو الجهاز فصل الملف ما يبوظش */
function writeJson(name: string, data: unknown) {
  fs.mkdirSync(dir(), { recursive: true });
  const tmp = file(`${name}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file(name));
}

/** التوكن بيتخزن مشفر بـ safeStorage (DPAPI على Windows) */
function readToken(): string | null {
  try {
    const buf = fs.readFileSync(file("token.bin"));
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString("utf8");
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  if (!token) {
    fs.rmSync(file("token.bin"), { force: true });
    return;
  }
  fs.mkdirSync(dir(), { recursive: true });
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(token) : Buffer.from(token, "utf8");
  fs.writeFileSync(file("token.bin"), data);
}

export function createSession(): Session {
  const config = readJson<{ serverUrl?: string; task?: TaskRef | null }>("config.json") ?? {};
  const saveConfig = (patch: Partial<typeof config>) => {
    Object.assign(config, patch);
    writeJson("config.json", config);
  };
  return {
    serverUrl: config.serverUrl ?? __DEFAULT_SERVER_URL__,
    token: readToken(),
    cachedState: readJson<ServerState>("state.json"),
    task: config.task ?? null,
    saveServerUrl(url) {
      this.serverUrl = url;
      saveConfig({ serverUrl: url });
    },
    saveTask(task) {
      this.task = task;
      saveConfig({ task });
    },
    saveToken(token) {
      this.token = token;
      writeToken(token);
    },
    saveState(state) {
      this.cachedState = state;
      if (state) writeJson("state.json", state);
      else fs.rmSync(file("state.json"), { force: true });
    },
  };
}

export const queueStorage: QueueStorage = {
  load: () => readJson<QueueData>("queue.json"),
  save: (data) => writeJson("queue.json", data),
};

const MAX_PENDING_SHOTS = 500;

/** اللقطات المتأجلة: ملف jpg + ملف json لكل لقطة */
export function createShotStore(): ShotStore {
  const shotsDir = () => path.join(dir(), "pending-shots");
  const ids = () => {
    try {
      return fs.readdirSync(shotsDir()).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
    } catch {
      return [];
    }
  };
  const remove = (id: string) => {
    fs.rmSync(path.join(shotsDir(), `${id}.json`), { force: true });
    fs.rmSync(path.join(shotsDir(), `${id}.jpg`), { force: true });
  };
  return {
    add(meta, jpeg) {
      fs.mkdirSync(shotsDir(), { recursive: true });
      const existing = ids();
      // لو النت فاصل فترة طويلة جدًا نمسح الأقدم عشان ما نملاش الهارد
      for (const old of existing.slice(0, Math.max(0, existing.length - MAX_PENDING_SHOTS + 1))) remove(old);
      const id = `${Date.parse(meta.takenAt)}-${meta.display}`;
      fs.writeFileSync(path.join(shotsDir(), `${id}.jpg`), jpeg);
      fs.writeFileSync(path.join(shotsDir(), `${id}.json`), JSON.stringify(meta));
    },
    list(limit) {
      const out: { id: string; meta: ShotMeta }[] = [];
      for (const id of ids().slice(0, limit)) {
        try {
          out.push({ id, meta: JSON.parse(fs.readFileSync(path.join(shotsDir(), `${id}.json`), "utf8")) as ShotMeta });
        } catch {
          remove(id);
        }
      }
      return out;
    },
    read(id) {
      try {
        return new Uint8Array(fs.readFileSync(path.join(shotsDir(), `${id}.jpg`)));
      } catch {
        return null;
      }
    },
    remove,
    clear() {
      fs.rmSync(shotsDir(), { recursive: true, force: true });
    },
    count: () => ids().length,
  };
}

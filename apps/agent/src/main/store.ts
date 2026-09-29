import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { Session } from "../core/controller";
import type { QueueData, QueueStorage } from "../core/queue";
import type { ServerState } from "../core/types";

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
  const config = readJson<{ serverUrl?: string }>("config.json") ?? {};
  return {
    serverUrl: config.serverUrl ?? __DEFAULT_SERVER_URL__,
    token: readToken(),
    cachedState: readJson<ServerState>("state.json"),
    saveServerUrl(url) {
      this.serverUrl = url;
      writeJson("config.json", { serverUrl: url });
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

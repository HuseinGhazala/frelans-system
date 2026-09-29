import { ApiError, type Api, type Session } from "../core/controller";
import type { ServerState } from "../core/types";

const TIMEOUT_MS = 20_000;

async function request<T>(url: string, init: RequestInit & { token?: string | null }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? `خطأ من السيرفر (${res.status})`, res.status);
  return data as T;
}

export function createApi(session: Session): Api {
  const url = (p: string) => `${session.serverUrl.replace(/\/$/, "")}/api/agent/v1${p}`;
  return {
    login: (serverUrl, body) =>
      request(`${serverUrl.replace(/\/$/, "")}/api/agent/v1/login`, { method: "POST", body: JSON.stringify(body) }),
    state: () => request<ServerState>(url("/state"), { method: "GET", token: session.token }),
    consent: () => request<ServerState>(url("/consent"), { method: "POST", body: "{}", token: session.token }),
    sync: (body) => request<ServerState>(url("/sync"), { method: "POST", body: JSON.stringify(body), token: session.token }),
    logout: async () => {
      await request(url("/logout"), { method: "POST", body: "{}", token: session.token });
    },
  };
}

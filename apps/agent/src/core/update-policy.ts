/**
 * قواعد التحديث التلقائي (من غير Electron عشان تتختبر):
 * - البرنامج بيدوّر على نسخة جديدة بعد ما يفتح بشوية، وبعدين كل فترة، ولما الجهاز يصحى من النوم.
 * - التحديث بيتنزل في الخلفية.
 * - لو الموظف مش مسجل حضور والشباك مقفول → يتسطب على طول من غير ما يزعجه.
 * - غير كده بيستنى: يتسطب لما البرنامج يتقفل، أو لما الموظف يضغط "تحديث دلوقتي".
 */

export const FIRST_CHECK_DELAY_MS = 60_000;
export const CHECK_INTERVAL_MS = 4 * 3_600_000;
/** ما نسألش أكتر من مرة في الفترة دي (مثلًا لو الجهاز نام وصحي كذا مرة ورا بعض) */
export const MIN_CHECK_GAP_MS = 10 * 60_000;

export type UpdateState =
  | { phase: "idle" }
  | { phase: "checking" }
  | { phase: "downloading"; version: string; percent: number }
  | { phase: "ready"; version: string }
  | { phase: "error"; message: string };

export function shouldCheck(lastCheckAt: number | null, now: number): boolean {
  return lastCheckAt === null || now - lastCheckAt >= MIN_CHECK_GAP_MS;
}

/** نسطّب على طول من غير ما نسأل؟ بس لو مفيش حضور شغال والشباك مش قدام الموظف */
export function shouldInstallSilently(input: { ready: boolean; status: "WORKING" | "ON_BREAK" | "OFFLINE"; windowVisible: boolean }): boolean {
  return input.ready && input.status === "OFFLINE" && !input.windowVisible;
}

export function trayUpdateLabel(state: UpdateState): string | null {
  if (state.phase === "ready") return `تحديث البرنامج لنسخة ${state.version} (إعادة تشغيل)`;
  if (state.phase === "downloading") return `بينزّل تحديث ${state.version}… ${Math.round(state.percent)}%`;
  return null;
}

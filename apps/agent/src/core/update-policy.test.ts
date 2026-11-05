import { describe, expect, it } from "vitest";
import { MIN_CHECK_GAP_MS, shouldCheck, shouldInstallSilently, trayUpdateLabel } from "./update-policy";

describe("update policy", () => {
  it("checks the first time and then not more often than the gap", () => {
    expect(shouldCheck(null, 1000)).toBe(true);
    expect(shouldCheck(0, MIN_CHECK_GAP_MS - 1)).toBe(false);
    expect(shouldCheck(0, MIN_CHECK_GAP_MS)).toBe(true);
  });

  it("installs silently only when ready, not checked in and window hidden", () => {
    expect(shouldInstallSilently({ ready: true, status: "OFFLINE", windowVisible: false })).toBe(true);
    expect(shouldInstallSilently({ ready: true, status: "WORKING", windowVisible: false })).toBe(false);
    expect(shouldInstallSilently({ ready: true, status: "ON_BREAK", windowVisible: false })).toBe(false);
    expect(shouldInstallSilently({ ready: true, status: "OFFLINE", windowVisible: true })).toBe(false);
    expect(shouldInstallSilently({ ready: false, status: "OFFLINE", windowVisible: false })).toBe(false);
  });

  it("tray label", () => {
    expect(trayUpdateLabel({ phase: "idle" })).toBeNull();
    expect(trayUpdateLabel({ phase: "ready", version: "0.4.0" })).toContain("0.4.0");
    expect(trayUpdateLabel({ phase: "downloading", version: "0.4.0", percent: 41.6 })).toContain("42%");
  });
});

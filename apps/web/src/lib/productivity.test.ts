import { describe, expect, it } from "vitest";
import { classify, normalizeName, type Category } from "./productivity";

const rules = new Map<string, Category>([
  ["code", "PRODUCTIVE"],
  ["youtube", "UNPRODUCTIVE"],
  ["github.com", "PRODUCTIVE"],
]);

describe("classify", () => {
  it("normalizes names", () => {
    expect(normalizeName("Code.exe")).toBe("code");
    expect(normalizeName("WWW.GitHub.com")).toBe("github.com");
  });
  it("prefers the site over the browser", () => {
    expect(classify(rules, "chrome.exe", "YouTube")).toBe("UNPRODUCTIVE");
    expect(classify(rules, "Google Chrome", "www.github.com")).toBe("PRODUCTIVE");
    expect(classify(rules, "Safari", "youtube.com")).toBe("UNPRODUCTIVE");
  });
  it("falls back to the app, then neutral", () => {
    expect(classify(rules, "Code.exe", null)).toBe("PRODUCTIVE");
    expect(classify(rules, "Unknown.exe", null)).toBe("NEUTRAL");
  });
});

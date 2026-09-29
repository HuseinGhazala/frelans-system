import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("adds a BOM, quotes and escapes, and neutralizes formulas", () => {
    const out = toCsv([["اسم", 'a"b', "x,y"], ["=cmd()", -5, null]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain('"a""b"');
    expect(out).toContain('"x,y"');
    expect(out).toContain("'=cmd()");
    expect(out).toContain(",-5,");
  });
});

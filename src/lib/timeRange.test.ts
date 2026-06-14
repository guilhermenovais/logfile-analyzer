import { describe, expect, it } from "vitest";
import { combine, formatLocal, pad, parseLocal } from "@/lib/timeRange";

describe("pad", () => {
  it("zero-pads single-digit numbers", () => {
    expect(pad(5)).toBe("05");
  });

  it("leaves two-digit numbers unchanged", () => {
    expect(pad(23)).toBe("23");
  });
});

describe("formatLocal", () => {
  it("formats epoch-ms as YYYY-MM-DD HH:mm, zero-padded", () => {
    const epochMs = new Date(2026, 0, 2, 3, 4, 0, 0).getTime();
    expect(formatLocal(epochMs)).toBe("2026-01-02 03:04");
  });
});

describe("parseLocal", () => {
  it("round-trips formatLocal's output", () => {
    const epochMs = new Date(2026, 5, 12, 10, 30, 0, 0).getTime();
    expect(parseLocal(formatLocal(epochMs))).toBe(epochMs);
  });

  it("returns null for malformed strings", () => {
    expect(parseLocal("not a date")).toBeNull();
    expect(parseLocal("2026-06-12")).toBeNull();
  });

  it("returns null for invalid dates that don't round-trip", () => {
    expect(parseLocal("2026-13-01 00:00")).toBeNull();
    expect(parseLocal("2026-02-30 00:00")).toBeNull();
  });
});

describe("combine", () => {
  it("combines date's year/month/day with hour/minute, zeroing seconds/ms", () => {
    const date = new Date(2026, 5, 12, 23, 59, 59, 999);
    const result = combine(date, 8, 15);
    expect(result).toBe(new Date(2026, 5, 12, 8, 15, 0, 0).getTime());
  });
});

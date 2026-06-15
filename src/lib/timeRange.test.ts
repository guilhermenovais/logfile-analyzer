import { describe, expect, it } from "vitest";
import { combineInOffset, formatInOffset, pad, parseInOffset } from "@/lib/timeRange";

describe("pad", () => {
  it("zero-pads single-digit numbers", () => {
    expect(pad(5)).toBe("05");
  });

  it("leaves two-digit numbers unchanged", () => {
    expect(pad(23)).toBe("23");
  });
});

describe("formatInOffset", () => {
  it("formats epoch-ms as YYYY-MM-DD HH:mm in UTC when offsetMinutes is 0 (not the local TZ)", () => {
    const epochMs = Date.UTC(2026, 0, 2, 3, 4, 0, 0);
    expect(formatInOffset(epochMs, 0)).toBe("2026-01-02 03:04");
  });

  it("formats epoch-ms as the wall-clock time in UTC+offsetMinutes for a positive offset", () => {
    const epochMs = Date.UTC(2026, 5, 12, 10, 0, 0, 0);
    expect(formatInOffset(epochMs, 120)).toBe("2026-06-12 12:00");
  });

  it("formats epoch-ms as the wall-clock time in UTC+offsetMinutes for a negative offset", () => {
    const epochMs = Date.UTC(2026, 5, 12, 10, 0, 0, 0);
    expect(formatInOffset(epochMs, -300)).toBe("2026-06-12 05:00");
  });
});

describe("parseInOffset", () => {
  it("round-trips formatInOffset's output for offsetMinutes = 0 (UTC, not the test runner's local TZ)", () => {
    const epochMs = Date.UTC(2026, 5, 12, 10, 30, 0, 0);
    expect(parseInOffset(formatInOffset(epochMs, 0), 0)).toBe(epochMs);
  });

  it("round-trips formatInOffset's output for a non-zero offset", () => {
    const epochMs = Date.UTC(2026, 5, 12, 10, 30, 0, 0);
    expect(parseInOffset(formatInOffset(epochMs, 120), 120)).toBe(epochMs);
    expect(parseInOffset(formatInOffset(epochMs, -300), -300)).toBe(epochMs);
  });

  it("returns null for malformed strings", () => {
    expect(parseInOffset("not a date", 0)).toBeNull();
    expect(parseInOffset("2026-06-12", 0)).toBeNull();
  });

  it("returns null for invalid dates that don't round-trip", () => {
    expect(parseInOffset("2026-13-01 00:00", 0)).toBeNull();
    expect(parseInOffset("2026-02-30 00:00", 0)).toBeNull();
  });
});

describe("combineInOffset", () => {
  it("combines date's local year/month/day with hour/minute under UTC+offsetMinutes, zeroing seconds/ms", () => {
    const date = new Date(2026, 5, 12, 23, 59, 59, 999);
    const result = combineInOffset(date, 8, 15, 0);
    expect(result).toBe(Date.UTC(2026, 5, 12, 8, 15, 0, 0));
  });

  it("applies the offset when combining for a non-zero offsetMinutes", () => {
    const date = new Date(2026, 5, 12, 23, 59, 59, 999);
    const result = combineInOffset(date, 8, 15, 120);
    expect(result).toBe(Date.UTC(2026, 5, 12, 8, 15, 0, 0) - 120 * 60_000);
  });
});

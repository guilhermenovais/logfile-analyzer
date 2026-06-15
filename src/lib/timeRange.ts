export function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * Formats epoch-ms as `YYYY-MM-DD HH:mm`, the wall-clock time in
 * `UTC+offsetMinutes` (contracts/file-properties-and-timezone.md §3). For
 * `offsetMinutes = 0` this is the UTC wall-clock time, not the browser's
 * local time.
 */
export function formatInOffset(epochMs: number, offsetMinutes: number): string {
  const date = new Date(epochMs + offsetMinutes * 60_000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

const TIME_RANGE_FORMAT = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

/**
 * Parses a `YYYY-MM-DD HH:mm` string as a wall-clock time in
 * `UTC+offsetMinutes`, returning epoch-ms, or `null` if `text` doesn't match
 * the format or fails the Y/M/D/H/M round-trip validation (inverse of
 * `formatInOffset`, contracts/file-properties-and-timezone.md §3).
 */
export function parseInOffset(text: string, offsetMinutes: number): number | null {
  const match = TIME_RANGE_FORMAT.exec(text.trim());
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute] = match.map(Number) as unknown as [
    string,
    number,
    number,
    number,
    number,
    number,
  ];
  const utcMs = Date.UTC(year, month - 1, day, hour, minute);
  const date = new Date(utcMs);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute
  ) {
    return null;
  }
  return utcMs - offsetMinutes * 60_000;
}

/**
 * Combines `date`'s local year/month/day (a wall-clock date in
 * `UTC+offsetMinutes`, e.g. from the picker seeding in `TimeRangeField`) with
 * `hour`/`minute`, returning the corresponding epoch-ms under the same
 * `UTC+offsetMinutes` interpretation (contracts/file-properties-and-timezone.md §3).
 */
export function combineInOffset(
  date: Date,
  hour: number,
  minute: number,
  offsetMinutes: number,
): number {
  const utcMs = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
  return utcMs - offsetMinutes * 60_000;
}

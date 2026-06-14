export function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/** Formats epoch-ms as `YYYY-MM-DD HH:mm` in local time (research.md §4). */
export function formatLocal(epochMs: number): string {
  const date = new Date(epochMs);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const LOCAL_FORMAT = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

/** Parses a `YYYY-MM-DD HH:mm` string to epoch-ms, or `null` if invalid (research.md §4). */
export function parseLocal(text: string): number | null {
  const match = LOCAL_FORMAT.exec(text.trim());
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
  const date = new Date(year, month - 1, day, hour, minute);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }
  return date.getTime();
}

/**
 * Combines `date`'s year/month/day with `hour`/`minute`, returning epoch-ms.
 */
export function combine(date: Date, hour: number, minute: number): number {
  const combined = new Date(date);
  combined.setHours(hour, minute, 0, 0);
  return combined.getTime();
}

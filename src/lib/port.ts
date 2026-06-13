export const INVALID_PORT_MESSAGE = "Enter a port number between 1 and 65535.";

export function parsePort(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const port = Number(trimmed);
  if (port < 1 || port > 65535) return null;
  return port;
}

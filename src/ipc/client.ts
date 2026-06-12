import { Channel } from "@tauri-apps/api/core";
import type { AppError } from "@/bindings";

export type { AppError };

/** Thrown by {@link unwrapResult} when a command resolves to a `status: "error"`. */
export class IpcError extends Error {
  constructor(public readonly appError: AppError) {
    super(
      appError.kind === "Io" ? `io error: ${appError.message}` : appError.kind,
    );
    this.name = "IpcError";
  }
}

/**
 * The `tauri-specta`-generated shape for every `Result<T, AppError>` command
 * (Principle I).
 */
export type CommandResult<T> =
  | { status: "ok"; data: T }
  | { status: "error"; error: AppError };

/**
 * Unwraps a `tauri-specta` command result, throwing {@link IpcError} for
 * `status: "error"` so callers can use normal try/catch and TanStack Query
 * error handling.
 */
export function unwrapResult<T>(result: CommandResult<T>): T {
  if (result.status === "error") {
    throw new IpcError(result.error);
  }
  return result.data;
}

export { Channel };

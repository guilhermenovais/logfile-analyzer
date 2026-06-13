import { useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { IpcError } from "@/ipc/client";
import { INVALID_PORT_MESSAGE, parsePort } from "@/lib/port";

export interface PortSetupDialogProps {
  /** Whether the dialog is visible. Non-dismissible while `true` (FR-002). */
  open: boolean;
  /** Submits the chosen port; rejects with `IpcError` on `InvalidPort`/`PortUnavailable`. */
  onSubmit: (port: number) => Promise<void>;
}

/**
 * Blocking first-launch dialog that collects a valid, available MCP server
 * port (US1, FR-001–FR-005).
 */
export function PortSetupDialog({ open, onSubmit }: PortSetupDialogProps) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const port = parsePort(value);
    if (port === null) {
      setError(INVALID_PORT_MESSAGE);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(port);
    } catch (err) {
      if (err instanceof IpcError && err.appError.kind === "PortUnavailable") {
        setError(
          `Port ${port} is unavailable (${err.appError.message}). Choose another port.`,
        );
      } else if (err instanceof IpcError && err.appError.kind === "InvalidPort") {
        setError(INVALID_PORT_MESSAGE);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={() => {}}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-4 shadow-lg">
          <Dialog.Title className="text-sm font-semibold">
            Choose an MCP server port
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            The log analyzer exposes an MCP server on localhost so agent
            tools can connect to it. Choose a port for it to use.
          </Dialog.Description>
          <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs">
              Port
              <input
                className="rounded border px-2 py-1 text-sm"
                type="text"
                inputMode="numeric"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                required
              />
            </label>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="mt-1 flex justify-end gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

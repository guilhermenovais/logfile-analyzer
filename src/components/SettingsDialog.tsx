import { useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AgentInstructionsDialog } from "@/components/AgentInstructionsDialog";
import { useConfigureMcpPort, useMcpStatus } from "@/hooks/useMcpSettings";
import { IpcError } from "@/ipc/client";
import { INVALID_PORT_MESSAGE, parsePort } from "@/lib/port";

export interface SettingsDialogProps {
  /** Whether the dialog is visible. Dismissible (FR-012). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Lets the user view and change the configured MCP server port at any time
 * (US3, FR-012–FR-016), and opens connection instructions for the current
 * port.
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { data } = useMcpStatus();
  const configurePort = useConfigureMcpPort();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [syncedPort, setSyncedPort] = useState<number | null>(null);

  if (data?.port !== undefined && data.port !== null && data.port !== syncedPort) {
    setSyncedPort(data.port);
    setValue(String(data.port));
  }

  const parsed = parsePort(value);
  const validationError = parsed === null ? INVALID_PORT_MESSAGE : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (parsed === null) {
      setError(INVALID_PORT_MESSAGE);
      return;
    }
    if (parsed === data?.port) {
      setError(null);
      return;
    }

    setError(null);
    try {
      const status = await configurePort.mutateAsync(parsed);
      if (status.port !== null) {
        setValue(String(status.port));
      }
    } catch (err) {
      if (err instanceof IpcError && err.appError.kind === "PortUnavailable") {
        setError(
          `Port ${parsed} is unavailable (${err.appError.message}). Choose another port.`,
        );
      } else if (err instanceof IpcError && err.appError.kind === "InvalidPort") {
        setError(INVALID_PORT_MESSAGE);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  const displayedError = error ?? validationError;

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-4 shadow-lg">
            <Dialog.Title className="text-sm font-semibold">
              Settings
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-xs text-muted-foreground">
              Change the port the MCP server listens on.
            </Dialog.Description>
            <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs">
                Port
                <input
                  className="rounded border px-2 py-1 text-sm"
                  type="text"
                  inputMode="numeric"
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value);
                    setError(null);
                  }}
                  required
                />
              </label>
              {displayedError && (
                <p className="text-xs text-destructive">{displayedError}</p>
              )}
              <div className="mt-1 flex justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setInstructionsOpen(true)}
                  className="rounded border px-2 py-1 text-xs hover:bg-accent"
                >
                  Connection instructions
                </button>
                <button
                  type="submit"
                  disabled={configurePort.isPending || validationError !== null}
                  className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {data?.port !== undefined && data.port !== null && (
        <AgentInstructionsDialog
          open={instructionsOpen}
          port={data.port}
          onOpenChange={setInstructionsOpen}
        />
      )}
    </>
  );
}

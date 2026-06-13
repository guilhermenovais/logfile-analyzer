import * as Dialog from "@radix-ui/react-dialog";

export interface McpErrorDialogProps {
  /** Whether the dialog is visible. Dismissible (FR-019). */
  open: boolean;
  /** The MCP server startup failure reason from `useMcpStatus()`. */
  error: string;
  onOpenChange: (open: boolean) => void;
  /** Opens the Settings dialog so the user can choose a different port. */
  onOpenSettings: () => void;
}

/**
 * Informs the user that the MCP server failed to start at launch, without
 * blocking the rest of the app (US4, FR-018–FR-020).
 */
export function McpErrorDialog({
  open,
  error,
  onOpenChange,
  onOpenSettings,
}: McpErrorDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-4 shadow-lg">
          <Dialog.Title className="text-sm font-semibold">
            MCP server failed to start
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            {error}
          </Dialog.Description>
          <div className="mt-3 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs hover:bg-accent"
              >
                Dismiss
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={onOpenSettings}
              className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
            >
              Go to Settings
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

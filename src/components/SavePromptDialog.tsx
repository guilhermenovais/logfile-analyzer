import { useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";

export interface SavePromptDialogProps {
  /** Whether the dialog is visible (FR-006). */
  open: boolean;
  /** Message from a failed save attempt (e.g. alias collision, FR-008). */
  error: string | null;
  /** Whether a save is currently in flight. */
  isSaving: boolean;
  /** Saves the draft under the entered alias (FR-008). */
  onSave: (alias: string) => void;
  /** Discards the draft and proceeds (FR-007). */
  onDiscard: () => void;
  /** Cancels the prompt, leaving the draft open. */
  onCancel: () => void;
}

/**
 * Prompts the user to save or discard the unsaved draft before closing it or
 * starting a new workspace (FR-006/FR-007/FR-008).
 */
export function SavePromptDialog({
  open,
  error,
  isSaving,
  onSave,
  onDiscard,
  onCancel,
}: SavePromptDialogProps) {
  const [alias, setAlias] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSave(alias.trim());
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-4 shadow-lg">
          <Dialog.Title className="text-sm font-semibold">
            Save workspace?
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            This workspace has unsaved changes. Save it under an alias to keep
            it, or discard it.
          </Dialog.Description>
          <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs">
              Alias
              <input
                className="rounded border px-2 py-1 text-sm"
                value={alias}
                onChange={(event) => setAlias(event.target.value)}
                required
              />
            </label>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="mt-1 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs hover:bg-accent"
                onClick={onDiscard}
              >
                Discard
              </button>
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs hover:bg-accent"
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || alias.trim() === ""}
                className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

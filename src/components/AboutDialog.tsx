import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import * as Dialog from "@radix-ui/react-dialog";

export interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Shown while the app version is loading, or if it fails to load (Edge Cases). */
const VERSION_FALLBACK = "—";

/**
 * Shows the app's current version, read via `@tauri-apps/api/app`'s
 * `getVersion()` (FR-008/FR-009).
 */
export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    getVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 w-72 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-4 shadow-lg">
          <Dialog.Title className="text-sm font-semibold">About</Dialog.Title>
          <Dialog.Description className="mt-3 text-xs text-muted-foreground">
            Version <span>{version ?? VERSION_FALLBACK}</span>
          </Dialog.Description>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

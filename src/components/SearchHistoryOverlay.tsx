import * as Dialog from "@radix-ui/react-dialog";
import type { SearchHistoryEntry } from "@/bindings";

export interface SearchHistoryOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The workspace's search history, most recent first (FR-012). */
  entries: SearchHistoryEntry[];
  /** Called when the user picks an entry to re-run (FR-018). */
  onSelect: (entry: SearchHistoryEntry) => void;
}

/**
 * Overlay listing every distinct search previously executed in the current
 * workspace, most recent first (FR-012), opened via the search field's clock
 * icon (FR-011).
 */
export function SearchHistoryOverlay({
  open,
  onOpenChange,
  entries,
  onSelect,
}: SearchHistoryOverlayProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 w-96 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-4 shadow-lg">
          <Dialog.Title className="text-sm font-semibold">
            Search history
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            Every search made in this workspace, most recent first.
          </Dialog.Description>

          {entries.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Nothing to show yet.
            </p>
          ) : (
            <ul
              role="listbox"
              className="mt-3 flex max-h-72 flex-col gap-1 overflow-auto text-xs"
            >
              {entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent"
                    onClick={() => onSelect(entry)}
                  >
                    <span className="flex-1 truncate font-mono">
                      {entry.query}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {entry.search_type}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

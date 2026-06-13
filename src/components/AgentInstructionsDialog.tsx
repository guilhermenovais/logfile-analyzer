import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { agentTools } from "@/lib/agentTools";

export interface AgentInstructionsDialogProps {
  /** Whether the dialog is visible. Dismissible (FR-019). */
  open: boolean;
  /** The configured MCP server port to substitute into instructions. */
  port: number;
  onOpenChange: (open: boolean) => void;
}

const COPIED_RESET_DELAY_MS = 2000;

/**
 * Shows per-tool connection instructions for the configured MCP server port,
 * with a copy-to-clipboard action (US2, FR-008–FR-011).
 */
export function AgentInstructionsDialog({
  open,
  port,
  onOpenChange,
}: AgentInstructionsDialogProps) {
  const [selectedId, setSelectedId] = useState(agentTools[0].id);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), COPIED_RESET_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [copied]);

  const selected =
    agentTools.find((tool) => tool.id === selectedId) ?? agentTools[0];
  const text = selected.instructions(port);

  async function handleCopy() {
    await writeText(text);
    setCopied(true);
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 w-96 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-4 shadow-lg">
          <Dialog.Title className="text-sm font-semibold">
            Connect an agent tool
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            The MCP server is running on port {port}. Use these instructions
            to connect your agent tool.
          </Dialog.Description>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs">
              Tool
              <select
                className="rounded border px-2 py-1 text-sm"
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {agentTools.map((tool) => (
                  <option key={tool.id} value={tool.id}>
                    {tool.name}
                  </option>
                ))}
              </select>
            </label>
            <pre className="overflow-x-auto rounded border bg-muted p-2 text-xs whitespace-pre-wrap">
              {text}
            </pre>
            <div className="mt-1 flex items-center justify-end gap-2">
              {copied && (
                <span className="text-xs text-muted-foreground">Copied!</span>
              )}
              <button
                type="button"
                onClick={handleCopy}
                className="rounded border px-2 py-1 text-xs"
              >
                Copy
              </button>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
                >
                  Done
                </button>
              </Dialog.Close>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

import { useState, type ReactNode } from "react";
import { AgentInstructionsDialog } from "@/components/AgentInstructionsDialog";
import { McpErrorDialog } from "@/components/McpErrorDialog";
import { PortSetupDialog } from "@/components/PortSetupDialog";
import { useConfigureMcpPort, useMcpStatus } from "@/hooks/useMcpSettings";

export interface McpSetupGateProps {
  children: ReactNode;
  /** Opens the Settings dialog, offered as a fix path from `McpErrorDialog`. */
  onOpenSettings: () => void;
}

/**
 * Sequences MCP server setup/error dialogs around the app shell
 * (research.md §8): on first launch (`!configured`), blocks on
 * `PortSetupDialog` until a port is chosen, then shows
 * `AgentInstructionsDialog` for the newly-configured port (US2). Once that
 * first-run sequence is done, a startup bind failure (`configured && error`)
 * is surfaced via a dismissible `McpErrorDialog` (US4). The page content
 * always renders underneath, satisfying FR-019.
 */
export function McpSetupGate({ children, onOpenSettings }: McpSetupGateProps) {
  const { data } = useMcpStatus();
  const configurePort = useConfigureMcpPort();
  const [configuredPort, setConfiguredPort] = useState<number | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);

  const showError =
    data?.configured === true &&
    data.error !== null &&
    data.error !== dismissedError &&
    configuredPort === null;

  return (
    <>
      {children}
      <PortSetupDialog
        open={data !== undefined && !data.configured}
        onSubmit={async (port) => {
          await configurePort.mutateAsync(port);
          setConfiguredPort(port);
        }}
      />
      {configuredPort !== null && (
        <AgentInstructionsDialog
          open={true}
          port={configuredPort}
          onOpenChange={(open) => {
            if (!open) setConfiguredPort(null);
          }}
        />
      )}
      {data?.configured === true && data.error !== null && (
        <McpErrorDialog
          open={showError}
          error={data.error}
          onOpenChange={(open) => {
            if (!open) setDismissedError(data.error);
          }}
          onOpenSettings={onOpenSettings}
        />
      )}
    </>
  );
}

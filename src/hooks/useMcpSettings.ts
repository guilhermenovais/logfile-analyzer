import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { configureMcpPort, getMcpStatus } from "@/ipc/settings";

export const mcpStatusQueryKey = ["mcp", "status"] as const;

/** The current MCP server configuration and runtime status. */
export function useMcpStatus() {
  return useQuery({
    queryKey: mcpStatusQueryKey,
    queryFn: getMcpStatus,
  });
}

/** Configures (or reconfigures) the MCP server port (FR-006/FR-015). */
export function useConfigureMcpPort() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: configureMcpPort,
    onSuccess: (status) => {
      queryClient.setQueryData(mcpStatusQueryKey, status);
    },
  });
}

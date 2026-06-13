import { commands, type McpStatusInfo } from "@/bindings";
import { unwrapResult } from "./client";

export type { McpStatusInfo };

/** Returns the current MCP server configuration and runtime status. */
export async function getMcpStatus(): Promise<McpStatusInfo> {
  return unwrapResult(await commands.getMcpStatus());
}

/**
 * Validates, checks availability, persists, and hot-reconfigures the running
 * MCP server to `port` (FR-003/FR-005/FR-006/FR-015/FR-016).
 */
export async function configureMcpPort(port: number): Promise<McpStatusInfo> {
  return unwrapResult(await commands.configureMcpPort(port));
}

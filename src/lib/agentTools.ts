/** A connection-instructions profile for one MCP-capable agent tool (FR-008/FR-021). */
export interface AgentToolProfile {
  id: string;
  name: string;
  /** The exact command or config snippet to display and copy for `port`. */
  instructions: (port: number) => string;
}

function jsonMcpServerSnippet(
  port: number,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify(
    {
      mcpServers: {
        "logfile-analyzer": {
          url: `http://localhost:${port}/mcp`,
          ...extra,
        },
      },
    },
    null,
    2,
  );
}

/**
 * Static connection-instructions profiles (research.md §5): Claude Code CLI
 * (exact command, FR-010), Kiro IDE (FR-009), and a few other popular
 * MCP-capable tools (Assumptions).
 */
export const agentTools: AgentToolProfile[] = [
  {
    id: "claude-code-cli",
    name: "Claude Code CLI",
    instructions: (port) =>
      `claude mcp add --transport http logfile-analyzer http://localhost:${port}/mcp`,
  },
  {
    id: "kiro-ide",
    name: "Kiro IDE",
    instructions: (port) =>
      jsonMcpServerSnippet(port, { type: "streamable-http" }),
  },
  {
    id: "cursor",
    name: "Cursor",
    instructions: (port) => jsonMcpServerSnippet(port),
  },
  {
    id: "windsurf",
    name: "Windsurf",
    instructions: (port) => jsonMcpServerSnippet(port),
  },
  {
    id: "cline",
    name: "Cline",
    instructions: (port) =>
      jsonMcpServerSnippet(port, { type: "streamableHttp" }),
  },
];

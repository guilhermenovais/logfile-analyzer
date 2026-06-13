import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentInstructionsDialog } from "./AgentInstructionsDialog";

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: vi.fn().mockResolvedValue(undefined),
}));

describe("AgentInstructionsDialog", () => {
  beforeEach(() => {
    vi.mocked(writeText).mockClear();
  });

  it("shows instructions containing the port for the default selected tool", () => {
    render(
      <AgentInstructionsDialog open={true} port={8741} onOpenChange={() => {}} />,
    );

    expect(screen.getByText(/8741/, { selector: "pre" })).toBeInTheDocument();
  });

  it("shows the exact Claude Code CLI command when selected (FR-010)", async () => {
    render(
      <AgentInstructionsDialog open={true} port={8741} onOpenChange={() => {}} />,
    );

    await userEvent.selectOptions(
      screen.getByRole("combobox"),
      "Claude Code CLI",
    );

    expect(
      screen.getByText(
        "claude mcp add --transport http logfile-analyzer http://localhost:8741/mcp",
      ),
    ).toBeInTheDocument();
  });

  it("shows a Kiro IDE snippet referencing the MCP URL when selected (FR-009)", async () => {
    render(
      <AgentInstructionsDialog open={true} port={8741} onOpenChange={() => {}} />,
    );

    await userEvent.selectOptions(screen.getByRole("combobox"), "Kiro IDE");

    expect(screen.getByText(/http:\/\/localhost:8741\/mcp/)).toBeInTheDocument();
  });

  it("copies the displayed text to the clipboard and shows a confirmation (FR-011)", async () => {
    render(
      <AgentInstructionsDialog open={true} port={8741} onOpenChange={() => {}} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /copy/i }));

    expect(writeText).toHaveBeenCalledWith(
      "claude mcp add --transport http logfile-analyzer http://localhost:8741/mcp",
    );
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });
});

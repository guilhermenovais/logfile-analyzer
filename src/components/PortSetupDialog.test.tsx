import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IpcError } from "@/ipc/client";
import { PortSetupDialog } from "./PortSetupDialog";

describe("PortSetupDialog", () => {
  it("renders as non-dismissible when open", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PortSetupDialog open={true} onSubmit={onSubmit} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /close/i }),
    ).not.toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a validation message and does not submit for non-numeric input", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PortSetupDialog open={true} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/^port$/i), "abc");
    await userEvent.click(screen.getByRole("button", { name: /save|continue|submit/i }));

    expect(
      screen.getByText(/enter a port number between 1 and 65535/i),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows a validation message and does not submit for out-of-range input", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PortSetupDialog open={true} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/^port$/i), "99999");
    await userEvent.click(screen.getByRole("button", { name: /save|continue|submit/i }));

    expect(
      screen.getByText(/enter a port number between 1 and 65535/i),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a "port unavailable" message and stays open when onSubmit rejects with PortUnavailable', async () => {
    const onSubmit = vi.fn().mockRejectedValue(
      new IpcError({ kind: "PortUnavailable", message: "address in use" }),
    );
    render(<PortSetupDialog open={true} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/^port$/i), "8080");
    await userEvent.click(screen.getByRole("button", { name: /save|continue|submit/i }));

    expect(
      await screen.findByText(/8080 is unavailable \(address in use\)/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("calls onSubmit with the parsed port number for a valid value", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PortSetupDialog open={true} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/^port$/i), "8080");
    await userEvent.click(screen.getByRole("button", { name: /save|continue|submit/i }));

    expect(onSubmit).toHaveBeenCalledWith(8080);
  });
});

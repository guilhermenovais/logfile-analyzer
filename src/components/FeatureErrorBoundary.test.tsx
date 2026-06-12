import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FeatureErrorBoundary } from "./FeatureErrorBoundary";

function Boom(): null {
  throw new Error("boom");
}

let shouldThrow = true;

function Flaky(): null {
  if (shouldThrow) {
    throw new Error("boom");
  }
  return null;
}

describe("FeatureErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <FeatureErrorBoundary label="Log viewer">
        <p>content</p>
      </FeatureErrorBoundary>,
    );

    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("renders a fallback message naming the feature and the error", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <FeatureErrorBoundary label="Log viewer">
        <Boom />
      </FeatureErrorBoundary>,
    );

    expect(screen.getByText(/Log viewer encountered an error: boom/)).toBeInTheDocument();

    consoleError.mockRestore();
  });

  it("clears the error when retrying", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    shouldThrow = true;

    render(
      <FeatureErrorBoundary label="Log viewer">
        <Flaky />
      </FeatureErrorBoundary>,
    );

    expect(screen.getByText(/encountered an error/)).toBeInTheDocument();

    shouldThrow = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.queryByText(/encountered an error/)).not.toBeInTheDocument();

    consoleError.mockRestore();
  });
});

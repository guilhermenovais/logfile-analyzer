import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_LINE_SELECTION_SLICE,
  getLineSelectionSlice,
  useLineSelectionStore,
} from "./useLineSelectionStore";

function reset() {
  useLineSelectionStore.setState({ slices: {} });
}

describe("useLineSelectionStore", () => {
  beforeEach(() => {
    reset();
  });

  it("defaults a not-yet-seen alias to selectedLine: null", () => {
    expect(getLineSelectionSlice("never-seen")).toEqual(
      DEFAULT_LINE_SELECTION_SLICE,
    );
    expect(getLineSelectionSlice("never-seen").selectedLine).toBeNull();
  });

  it("selectLine sets selectedLine for that alias", () => {
    useLineSelectionStore.getState().selectLine("a", 5);

    expect(getLineSelectionSlice("a").selectedLine).toBe(5);
  });

  it("selectLine on one alias does not affect another alias's slice (FR-016)", () => {
    useLineSelectionStore.getState().selectLine("a", 5);

    expect(getLineSelectionSlice("b")).toEqual(DEFAULT_LINE_SELECTION_SLICE);
  });

  it("selectLine again on the same alias overwrites the previous selection", () => {
    useLineSelectionStore.getState().selectLine("a", 5);
    useLineSelectionStore.getState().selectLine("a", 9);

    expect(getLineSelectionSlice("a").selectedLine).toBe(9);
  });

  it("selectLine does not bump navNonce", () => {
    useLineSelectionStore.getState().selectLine("a", 5);

    expect(getLineSelectionSlice("a").navNonce).toBe(0);
  });

  describe("moveSelection (US4)", () => {
    it("moves selectedLine by delta, clamped to [1, totalLines], and bumps navNonce", () => {
      useLineSelectionStore.getState().selectLine("a", 5);

      useLineSelectionStore.getState().moveSelection("a", 1, 10, 1);
      expect(getLineSelectionSlice("a").selectedLine).toBe(6);
      expect(getLineSelectionSlice("a").navNonce).toBe(1);

      useLineSelectionStore.getState().moveSelection("a", -1, 10, 1);
      expect(getLineSelectionSlice("a").selectedLine).toBe(5);
      expect(getLineSelectionSlice("a").navNonce).toBe(2);
    });

    it("uses fallbackLine as the starting point when selectedLine is null", () => {
      useLineSelectionStore.getState().moveSelection("a", 1, 10, 4);

      expect(getLineSelectionSlice("a").selectedLine).toBe(5);
      expect(getLineSelectionSlice("a").navNonce).toBe(1);
    });

    it("is a no-op at the upper bound (does not bump navNonce, scenario 5)", () => {
      useLineSelectionStore.getState().selectLine("a", 10);

      useLineSelectionStore.getState().moveSelection("a", 1, 10, 1);

      expect(getLineSelectionSlice("a").selectedLine).toBe(10);
      expect(getLineSelectionSlice("a").navNonce).toBe(0);
    });

    it("is a no-op at the lower bound (does not bump navNonce, scenario 5)", () => {
      useLineSelectionStore.getState().selectLine("a", 1);

      useLineSelectionStore.getState().moveSelection("a", -1, 10, 1);

      expect(getLineSelectionSlice("a").selectedLine).toBe(1);
      expect(getLineSelectionSlice("a").navNonce).toBe(0);
    });
  });
});

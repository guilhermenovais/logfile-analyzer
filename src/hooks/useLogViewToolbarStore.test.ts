import { describe, expect, it, beforeEach } from "vitest";
import {
  DEFAULT_LOG_VIEW_TOOLBAR_STATE,
  getLogViewToolbarSlice,
  useLogViewToolbarStore,
} from "./useLogViewToolbarStore";

function reset() {
  useLogViewToolbarStore.setState({ slices: {} });
}

describe("useLogViewToolbarStore", () => {
  beforeEach(() => {
    reset();
  });

  it("defaults a not-yet-seen alias to highlightedOnly/highlightsVisible/wrap: false", () => {
    expect(getLogViewToolbarSlice("never-seen")).toEqual(
      DEFAULT_LOG_VIEW_TOOLBAR_STATE,
    );
  });

  it("setHighlightedOnly updates only that alias's highlightedOnly", () => {
    useLogViewToolbarStore.getState().setHighlightedOnly("a", true);

    const slice = getLogViewToolbarSlice("a");
    expect(slice.highlightedOnly).toBe(true);
    expect(slice.highlightsVisible).toBe(false);
    expect(slice.wrap).toBe(false);

    expect(getLogViewToolbarSlice("b")).toEqual(DEFAULT_LOG_VIEW_TOOLBAR_STATE);
  });

  it("toggleHighlightsVisible flips highlightsVisible without changing highlightedOnly/wrap (FR-005)", () => {
    useLogViewToolbarStore.getState().toggleHighlightsVisible("a");
    expect(getLogViewToolbarSlice("a").highlightsVisible).toBe(true);

    useLogViewToolbarStore.getState().toggleHighlightsVisible("a");
    expect(getLogViewToolbarSlice("a").highlightsVisible).toBe(false);

    const slice = getLogViewToolbarSlice("a");
    expect(slice.highlightedOnly).toBe(false);
    expect(slice.wrap).toBe(false);
  });

  it("setWrap updates only that alias's wrap", () => {
    useLogViewToolbarStore.getState().setWrap("a", true);

    const slice = getLogViewToolbarSlice("a");
    expect(slice.wrap).toBe(true);
    expect(slice.highlightedOnly).toBe(false);
    expect(slice.highlightsVisible).toBe(false);

    expect(getLogViewToolbarSlice("b")).toEqual(DEFAULT_LOG_VIEW_TOOLBAR_STATE);
  });
});

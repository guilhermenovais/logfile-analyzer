import { describe, expect, it, beforeEach } from "vitest";
import type { SearchHistoryEntry, SearchMatchEntry } from "@/bindings";
import { getLineSelectionSlice, useLineSelectionStore } from "./useLineSelectionStore";
import {
  DEFAULT_SEARCH_UI_STATE,
  getSearchUiSlice,
  useSearchUiStore,
} from "./useSearchUiStore";

const matches: SearchMatchEntry[] = [
  { line_index: 2, content: "two" },
  { line_index: 5, content: "five" },
  { line_index: 9, content: "nine" },
];

function reset() {
  useSearchUiStore.setState({ slices: {} });
  useLineSelectionStore.setState({ slices: {} });
}

describe("useSearchUiStore", () => {
  beforeEach(() => {
    reset();
  });

  it("gives different aliases independent slices (FR-016)", () => {
    useSearchUiStore.getState().setQuery("a", "error");

    expect(getSearchUiSlice("a").query).toBe("error");
    expect(getSearchUiSlice("b")).toEqual(DEFAULT_SEARCH_UI_STATE);
  });

  it("defaults a not-yet-seen alias", () => {
    expect(getSearchUiSlice("never-seen")).toEqual({
      query: "",
      searchType: "logical",
      timeFrom: null,
      timeTo: null,
      results: [],
      truncated: false,
      panelOpen: false,
      currentMatchIndex: -1,
      scrollNonce: 0,
    });
  });

  it("setResults opens the panel, selects the first match, and bumps scrollNonce", () => {
    useSearchUiStore.getState().setResults("a", matches, true);

    const slice = getSearchUiSlice("a");
    expect(slice.results).toEqual(matches);
    expect(slice.truncated).toBe(true);
    expect(slice.panelOpen).toBe(true);
    expect(slice.currentMatchIndex).toBe(0);
    expect(slice.scrollNonce).toBe(1);
  });

  it("setResults also selects the first match's line in useLineSelectionStore (FR-010)", () => {
    useSearchUiStore.getState().setResults("a", matches, true);

    expect(getLineSelectionSlice("a").selectedLine).toBe(matches[0].line_index);
  });

  it("setResults with no matches leaves currentMatchIndex at -1", () => {
    useSearchUiStore.getState().setResults("a", [], false);

    const slice = getSearchUiSlice("a");
    expect(slice.results).toEqual([]);
    expect(slice.currentMatchIndex).toBe(-1);
    expect(slice.scrollNonce).toBe(1);
  });

  it("setResults with no matches does not change selectedLine (FR-010)", () => {
    useLineSelectionStore.getState().selectLine("a", 4);

    useSearchUiStore.getState().setResults("a", [], false);

    expect(getLineSelectionSlice("a").selectedLine).toBe(4);
  });

  it("selectMatch sets currentMatchIndex and bumps scrollNonce", () => {
    useSearchUiStore.getState().setResults("a", matches, false);
    useSearchUiStore.getState().selectMatch("a", 2);

    const slice = getSearchUiSlice("a");
    expect(slice.currentMatchIndex).toBe(2);
    expect(slice.scrollNonce).toBe(2);
  });

  it("selectMatch also selects that match's line in useLineSelectionStore (FR-010)", () => {
    useSearchUiStore.getState().setResults("a", matches, false);
    useSearchUiStore.getState().selectMatch("a", 2);

    expect(getLineSelectionSlice("a").selectedLine).toBe(matches[2].line_index);
  });

  it("nextMatch/prevMatch wrap around in line-number order (FR-017)", () => {
    useSearchUiStore.getState().setResults("a", matches, false);

    useSearchUiStore.getState().nextMatch("a");
    expect(getSearchUiSlice("a").currentMatchIndex).toBe(1);

    useSearchUiStore.getState().nextMatch("a");
    expect(getSearchUiSlice("a").currentMatchIndex).toBe(2);

    // wraps from last to first
    useSearchUiStore.getState().nextMatch("a");
    expect(getSearchUiSlice("a").currentMatchIndex).toBe(0);

    // wraps from first to last
    useSearchUiStore.getState().prevMatch("a");
    expect(getSearchUiSlice("a").currentMatchIndex).toBe(2);
  });

  it("nextMatch/prevMatch also update selectedLine in useLineSelectionStore (FR-010)", () => {
    useSearchUiStore.getState().setResults("a", matches, false);

    useSearchUiStore.getState().nextMatch("a");
    expect(getLineSelectionSlice("a").selectedLine).toBe(matches[1].line_index);

    useSearchUiStore.getState().prevMatch("a");
    expect(getLineSelectionSlice("a").selectedLine).toBe(matches[0].line_index);
  });

  it("closePanel hides the panel but leaves query/results/currentMatchIndex untouched (FR-008)", () => {
    useSearchUiStore.getState().setQuery("a", "error");
    useSearchUiStore.getState().setResults("a", matches, false);
    useSearchUiStore.getState().selectMatch("a", 1);

    useSearchUiStore.getState().closePanel("a");

    const slice = getSearchUiSlice("a");
    expect(slice.panelOpen).toBe(false);
    expect(slice.query).toBe("error");
    expect(slice.results).toEqual(matches);
    expect(slice.currentMatchIndex).toBe(1);
  });

  it("an action on one alias does not affect another alias's slice", () => {
    useSearchUiStore.getState().setResults("a", matches, true);
    useSearchUiStore.getState().selectMatch("a", 2);

    expect(getSearchUiSlice("b")).toEqual(DEFAULT_SEARCH_UI_STATE);
  });

  describe("applyHistoryEntry (FR-018)", () => {
    const entry: SearchHistoryEntry = {
      id: 1,
      workspace_id: 1,
      query: '"error" AND "db"',
      search_type: "regex",
      time_from: 1000,
      time_to: 2000,
      last_used_at: "2026-06-12T10:00:00.000Z",
    };

    it("sets query, searchType, timeFrom, and timeTo from the entry", () => {
      useSearchUiStore.getState().applyHistoryEntry("a", entry);

      const slice = getSearchUiSlice("a");
      expect(slice.query).toBe('"error" AND "db"');
      expect(slice.searchType).toBe("regex");
      expect(slice.timeFrom).toBe(1000);
      expect(slice.timeTo).toBe(2000);
    });

    it("does not affect another alias's slice", () => {
      useSearchUiStore.getState().applyHistoryEntry("a", entry);

      expect(getSearchUiSlice("b")).toEqual(DEFAULT_SEARCH_UI_STATE);
    });
  });

  describe("searchMatchLines selector", () => {
    it("returns the matched line indices while the panel is open", () => {
      useSearchUiStore.getState().setResults("a", matches, false);

      expect(useSearchUiStore.searchMatchLines("a")).toEqual([2, 5, 9]);
    });

    it("returns an empty array once the panel is closed", () => {
      useSearchUiStore.getState().setResults("a", matches, false);
      useSearchUiStore.getState().closePanel("a");

      expect(useSearchUiStore.searchMatchLines("a")).toEqual([]);
    });
  });

  describe("scrollToLine selector", () => {
    it("returns the current match's line and scrollNonce while the panel is open", () => {
      useSearchUiStore.getState().setResults("a", matches, false);
      useSearchUiStore.getState().selectMatch("a", 2);

      expect(useSearchUiStore.scrollToLine("a")).toEqual({
        lineIndex: 9,
        nonce: 2,
      });
    });

    it("returns null when the panel is closed", () => {
      useSearchUiStore.getState().setResults("a", matches, false);
      useSearchUiStore.getState().closePanel("a");

      expect(useSearchUiStore.scrollToLine("a")).toBeNull();
    });

    it("returns null when there is no current match", () => {
      useSearchUiStore.getState().setResults("a", [], false);

      expect(useSearchUiStore.scrollToLine("a")).toBeNull();
    });
  });
});

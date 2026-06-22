import { useEffect, useRef } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import { resolveViewRow } from "@/ipc/viewing";

interface UseScrollToLineArgs {
  alias: string;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  scrollTarget: { lineIndex: number; nonce: number } | null;
  totalLines: number;
}

export function useScrollToLine({
  alias,
  virtualizer,
  scrollTarget,
  totalLines,
}: UseScrollToLineArgs): void {
  const generationRef = useRef(0);

  useEffect(() => {
    if (!scrollTarget) {
      return;
    }

    const generation = ++generationRef.current;

    resolveViewRow(alias, scrollTarget.lineIndex).then((viewRow) => {
      if (generationRef.current !== generation) return;

      const index = viewRow - 1;
      if (index < 0 || index >= totalLines) return;

      virtualizer.scrollToIndex(index, { align: "center" });

      requestAnimationFrame(() => {
        if (generationRef.current !== generation) return;
        virtualizer.scrollToIndex(index, { align: "center" });
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollTarget?.nonce]);
}

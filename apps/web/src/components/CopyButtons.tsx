"use client";

import { useEffect } from "react";

/**
 * Copy to clipboard buttons.
 *
 * One delegated listener for the whole page, so there is no React state and no
 * re-render. The button finds its target through the data attribute.
 */
export function CopyButtons() {
  useEffect(() => {
    async function onClick(event: MouseEvent) {
      const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-copy]");
      if (!target) return;
      const value = target.dataset.copy ?? "";
      try {
        await navigator.clipboard.writeText(value);
        const previous = target.textContent;
        target.textContent = "copied";
        setTimeout(() => {
          target.textContent = previous;
        }, 1400);
      } catch {
        target.textContent = "press ctrl+c";
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}

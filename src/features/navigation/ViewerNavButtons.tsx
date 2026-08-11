import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTabStore } from "../tabs/TabStore";
import type { PageTurn } from "../../shared/types";

const BUTTON_CLASS =
  "absolute top-1/2 h-[60%] w-8 -translate-y-1/2 flex flex-col items-center justify-center " +
  "text-muted-foreground/40 transition-colors hover:bg-accent/60 hover:text-accent-foreground";

/**
 * Thin, vertically stretched page-turn buttons overlaid on the left and right
 * edges of the document viewer.
 */
export function ViewerNavButtons() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const handle = activeTab?.handle ?? null;

  if (!handle) return null;

  const turn = (kind: PageTurn["kind"]) => () => handle.navigate({ kind });

  return (
    <>
      <button
        type="button"
        aria-label="Previous page"
        onClick={turn("left")}
        className={`${BUTTON_CLASS} left-0 rounded-r-lg`}
      >
        <ChevronLeft size={28} />
      </button>
      <button
        type="button"
        aria-label="Next page"
        onClick={turn("right")}
        className={`${BUTTON_CLASS} right-0 rounded-l-lg`}
      >
        <ChevronRight size={28} />
      </button>
    </>
  );
}

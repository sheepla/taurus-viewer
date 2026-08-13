import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, Loader2, Search, X } from "lucide-react";
import type { DocumentViewerHandle } from "../../shared/viewer-handle";
import type { SearchHit } from "../../shared/types";
import { useSearchState } from "./searchState";

/** Renders a snippet with every (case-insensitive) query occurrence marked. */
function MarkedSnippet({ text, query }: { text: string; query: string }) {
  const safeText = typeof text === "string" ? text : String(text ?? "");
  const parts = safeText.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
  return (
    <span className="whitespace-pre-wrap wrap-break-words">
      {parts.map((part, index) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={index} className="rounded-sm bg-yellow-300/70 px-0.5 text-foreground">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </span>
  );
}

function normalizeSnippet(snippet: unknown): string {
  if (typeof snippet === "string") return snippet;
  if (snippet && typeof snippet === "object") {
    const value = snippet as Record<string, unknown>;
    const candidates = [value.snippet, value.text, value.label, value.title, value.content];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }
  }
  return String(snippet ?? "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * SEARCH-mode sidebar panel: runs a full-text search over the active document
 * and lists the hits. Selecting a hit jumps to it; hit highlights in the
 * document are cleared when the query is reset.
 */
export function SearchPanel({ handle }: { handle: DocumentViewerHandle | null }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const setSearchQuery = useSearchState((state) => state.setQuery);
  const [activeIndex, setActiveIndex] = useState(0);
  const runIdRef = useRef(0);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLInputElement>('input[aria-label="Search in document"]')?.focus();
  }, []);

  const runSearch = async (term: string) => {
    if (!handle || !term.trim()) return;
    const runId = ++runIdRef.current;
    handle.clearSearch();
    setSearchQuery(term.trim());
    setQuery(term);
    setSearched(true);
    setSearching(true);
    setHits([]);
    setActiveIndex(0);
    const collected: SearchHit[] = [];
    try {
      for await (const hit of handle.search(term)) {
        if (runIdRef.current !== runId) return;
        collected.push(hit);
      }
      if (runIdRef.current === runId) {
        setHits(collected);
      }
    } finally {
      if (runIdRef.current === runId) {
        setSearching(false);
      }
    }
  };

  const reset = () => {
    runIdRef.current += 1;
    handle?.clearSearch();
    setSearchQuery("");
    setQuery("");
    setHits([]);
    setActiveIndex(0);
    setSearched(false);
    setSearching(false);
  };

  const jumpToHit = (index: number) => {
    if (!handle) return;
    setActiveIndex(index);
    const hit = hits[index];
    if (hit) {
      handle.goToPosition(hit.destination);
    }
  };

  if (!handle) return null;

  return (
    <div
      ref={panelRef}
      data-sidebar-panel
      className="flex h-full flex-col outline-none"
      tabIndex={0}
      onKeyDown={(event) => {
        if (!hits.length) return;
        const key = event.key;
        if (key === "j" || key === "ArrowDown") {
          event.preventDefault();
          const next = (activeIndex + 1) % hits.length;
          jumpToHit(next);
        } else if (key === "k" || key === "ArrowUp") {
          event.preventDefault();
          const next = (activeIndex - 1 + hits.length) % hits.length;
          jumpToHit(next);
        } else if ((key === "n" || key === "F3") && !event.shiftKey) {
          event.preventDefault();
          const next = (activeIndex + 1) % hits.length;
          jumpToHit(next);
        } else if (key === "N" || (key === "F3" && event.shiftKey)) {
          event.preventDefault();
          const next = (activeIndex - 1 + hits.length) % hits.length;
          jumpToHit(next);
        } else if (key === "Enter") {
          event.preventDefault();
          const hit = hits[activeIndex];
          if (hit) handle.goToPosition(hit.destination);
        }
      }}
    >
      <form
        className="flex items-center gap-1.5 border-b border-border p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(query);
        }}
      >
        <Search size={13} className="shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in document..."
          aria-label="Search in document"
          className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
          onKeyDown={(event) => {
            if (!hits.length) return;
            if (event.key === "F3" && event.shiftKey) {
              event.preventDefault();
              const next = (activeIndex - 1 + hits.length) % hits.length;
              jumpToHit(next);
            } else if (event.key === "n" || event.key === "F3") {
              event.preventDefault();
              const next = (activeIndex + 1) % hits.length;
              jumpToHit(next);
            } else if (event.key === "N") {
              event.preventDefault();
              const next = (activeIndex - 1 + hits.length) % hits.length;
              jumpToHit(next);
            }
          }}
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="flex h-7 items-center gap-1 rounded border border-border px-2 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {searching ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <CornerDownLeft size={13} />
          )}
          Search
        </button>
        <button
          type="button"
          onClick={reset}
          aria-label="Clear search"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X size={13} />
        </button>
      </form>

      <div className="flex-1 overflow-y-auto">
        {!searched ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            Search the full text of this document.
          </p>
        ) : searching ? (
          <p className="flex items-center justify-center gap-2 px-2 py-6 text-xs text-muted-foreground">
            <Loader2 size={13} className="animate-spin" />
            Searching...
          </p>
        ) : hits.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No results for &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <ul>
            {hits.map((hit, index) => (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => jumpToHit(index)}
                  data-active={index === activeIndex ? "true" : undefined}
                  aria-current={index === activeIndex ? "true" : undefined}
                  className={`w-full rounded px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground ${index === activeIndex ? "bg-accent" : ""}`}
                >
                  <MarkedSnippet text={normalizeSnippet(hit.snippet)} query={query} />
                  {hit.destination.format === "pdf" && (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      Page {hit.destination.pageIndex + 1}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex h-8 items-center gap-1.5 border-t border-border px-3 text-[11px] text-muted-foreground">
        <Search size={12} />
        <span>
          {searched && !searching
            ? `${hits.length} result${hits.length === 1 ? "" : "s"}`
            : " "}
        </span>
      </div>
    </div>
  );
}

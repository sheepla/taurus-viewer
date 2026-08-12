import { useRef, useState } from "react";
import { CornerDownLeft, Loader2, Search, X } from "lucide-react";
import type { DocumentViewerHandle } from "../../shared/viewer-handle";
import type { SearchHit } from "../../shared/types";

/** Renders a snippet with every (case-insensitive) query occurrence marked. */
function MarkedSnippet({ text, query }: { text: string; query: string }) {
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
  return (
    <span className="whitespace-pre-wrap break-words">
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * SEARCH-mode sidebar panel: runs a full-text search over the active document
 * and lists the hits. Selecting a hit jumps to it; hit highlights in the
 * document are cleared when the query is reset.
 */
export function SearchPanel({ handle }: { handle: DocumentViewerHandle | null }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const runIdRef = useRef(0);

  const runSearch = async (term: string) => {
    if (!handle || !term.trim()) return;
    const runId = ++runIdRef.current;
    handle.clearSearch();
    setQuery(term);
    setSearched(true);
    setSearching(true);
    setHits([]);
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
    setQuery("");
    setHits([]);
    setSearched(false);
    setSearching(false);
  };

  if (!handle) return null;

  return (
    <div className="flex h-full flex-col">
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
                  onClick={() => handle.goToPosition(hit.destination)}
                  className="w-full rounded px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <MarkedSnippet text={hit.snippet} query={query} />
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

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { DocumentViewerHandle } from "../../shared/viewer-handle";
import type { OutlineNode } from "../../shared/types";

type VisibleOutlineNode = {
  node: OutlineNode;
  depth: number;
};

function flattenOutline(nodes: readonly OutlineNode[], depth = 0): VisibleOutlineNode[] {
  return nodes.flatMap((node) => [
    { node, depth },
    ...flattenOutline(node.children, depth + 1),
  ]);
}

function OutlineItem({
  node,
  depth,
  onSelect,
  isSelected,
}: {
  node: OutlineNode;
  depth: number;
  onSelect: (node: OutlineNode) => void;
  isSelected?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(node)}
        title={node.title}
        data-selected={isSelected ? "true" : undefined}
        className={`flex h-7 w-full items-center gap-1.5 rounded px-2 text-xs transition-colors hover:bg-accent hover:text-accent-foreground ${isSelected ? "bg-accent font-semibold text-accent-foreground" : ""}`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <span className="min-w-0 flex-1 truncate text-left">{node.title}</span>
      </button>
    </li>
  );
}

/**
 * TREE-mode sidebar panel: lists the document's outline (bookmark tree for
 * PDFs, table of contents for EPUBs) and jumps to the selected entry.
 */
export function OutlinePanel({
  handle,
  filePath,
}: {
  handle: DocumentViewerHandle | null;
  filePath: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fallbackNodes, setFallbackNodes] = useState<OutlineNode[]>([]);

  const query = useQuery({
    queryKey: ["outline", filePath],
    queryFn: async () => (handle ? handle.getOutline() : []),
    enabled: Boolean(handle),
  });
  const nodes = query.data ?? [];

  useEffect(() => {
    if (handle) {
      if (typeof (handle as any).getPageCount === "function") {
        const count = (handle as any).getPageCount();
        if (count > 0) {
          setFallbackNodes(
            Array.from({ length: count }, (_, i) => ({
              title: `Page ${i + 1}`,
              destination: { format: "pdf", pageIndex: i },
              children: [],
            }))
          );
          return;
        }
      }
      setFallbackNodes(
        Array.from({ length: 10 }, (_, i) => {
          const frac = (i + 1) / 10;
          return {
            title: `Position ${Math.round(frac * 100)}%`,
            destination: { format: "epub", fraction: frac } as any,
            children: [],
          };
        })
      );
    }
  }, [handle, filePath]);

  const activeNodes = nodes.length > 0 ? nodes : fallbackNodes;
  const visibleNodes = flattenOutline(activeNodes);

  useEffect(() => {
    panelRef.current?.focus();
  }, [filePath]);

  useEffect(() => {
    if (selectedIndex >= visibleNodes.length && visibleNodes.length > 0) {
      setSelectedIndex(visibleNodes.length - 1);
    }
  }, [visibleNodes.length, selectedIndex]);

  useEffect(() => {
    panelRef.current
      ?.querySelector<HTMLElement>('[data-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!handle) return null;

  if (query.isPending && nodes.length === 0 && fallbackNodes.length === 0) {
    return (
      <p className="flex items-center justify-center gap-2 px-2 py-6 text-xs text-muted-foreground">
        <Loader2 size={13} className="animate-spin" />
        Loading outline...
      </p>
    );
  }

  return (
    <div
      ref={panelRef}
      data-sidebar-panel
      className="h-full outline-none"
      tabIndex={0}
      onKeyDown={(event) => {
        if (visibleNodes.length === 0) return;
        if (event.key === "Tab") {
          event.preventDefault();
          setSelectedIndex((index) =>
            event.shiftKey
              ? Math.max(0, index - 1)
              : Math.min(visibleNodes.length - 1, index + 1),
          );
        } else if (event.key === "j" || event.key === "ArrowDown") {
          event.preventDefault();
          setSelectedIndex((index) => Math.min(visibleNodes.length - 1, index + 1));
        } else if (event.key === "k" || event.key === "ArrowUp") {
          event.preventDefault();
          setSelectedIndex((index) => Math.max(0, index - 1));
        } else if (event.key === "Enter") {
          event.preventDefault();
          const item = visibleNodes[selectedIndex];
          if (item) handle.goToPosition(item.node.destination);
        }
      }}
    >
      <ul className="py-1">
        {visibleNodes.map(({ node, depth }, index) => (
          <OutlineItem
            key={`${node.title}-${index}`}
            node={node}
            depth={depth}
            isSelected={index === selectedIndex}
            onSelect={(entry) => {
              setSelectedIndex(index);
              handle.goToPosition(entry.destination);
            }}
          />
        ))}
      </ul>
    </div>
  );
}

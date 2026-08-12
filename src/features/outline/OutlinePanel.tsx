import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { DocumentViewerHandle } from "../../shared/viewer-handle";
import type { OutlineNode } from "../../shared/types";

function OutlineItem({
  node,
  depth,
  onSelect,
}: {
  node: OutlineNode;
  depth: number;
  onSelect: (node: OutlineNode) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(node)}
        title={node.title}
        className="flex h-7 w-full items-center gap-1.5 rounded px-2 text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <span className="min-w-0 flex-1 truncate text-left">{node.title}</span>
      </button>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child, index) => (
            <OutlineItem
              key={`${node.title}-${index}`}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
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
  const query = useQuery({
    queryKey: ["outline", filePath],
    queryFn: async () => (handle ? handle.getOutline() : []),
    enabled: Boolean(handle),
  });

  if (!handle) return null;

  if (query.isPending) {
    return (
      <p className="flex items-center justify-center gap-2 px-2 py-6 text-xs text-muted-foreground">
        <Loader2 size={13} className="animate-spin" />
        Loading outline...
      </p>
    );
  }

  const nodes = query.data ?? [];

  if (nodes.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-xs text-muted-foreground">
        No outline available for this document.
      </p>
    );
  }

  return (
    <ul className="py-1">
      {nodes.map((node, index) => (
        <OutlineItem
          key={`${node.title}-${index}`}
          node={node}
          depth={0}
          onSelect={(entry) => handle.goToPosition(entry.destination)}
        />
      ))}
    </ul>
  );
}

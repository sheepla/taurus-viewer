import { useEffect, useState } from "react";
import { useTabStore } from "../tabs/TabStore";
import type {
  DocumentPosition,
} from "../../shared/types";
import type { DocumentViewerHandle } from "../../shared/viewer-handle";

function ProgressText({
  position,
  progress,
}: {
  position: DocumentPosition;
  progress: number;
}) {
  const percent = `${Math.round(progress * 100)}%`;
  if (position.format === "pdf") {
    return (
      <span className="tabular-nums">
        Page {position.pageIndex + 1} / {position.pageCount} ({percent})
      </span>
    );
  }
  return <span className="tabular-nums">{percent}</span>;
}

export function StatusBar() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const handle = activeTab?.handle ?? null;

  if (!activeTab || !handle) return null;

  return <StatusBarContent key={activeTab.id} handle={handle} />;
}

function StatusBarContent({ handle }: { handle: DocumentViewerHandle }) {
  const [position, setPosition] = useState<DocumentPosition>(() =>
    handle.getCurrentPosition(),
  );
  const [progress, setProgress] = useState<number>(() => handle.getProgress());

  useEffect(() => {
    const unsubscribe = handle.onPositionChange(() => {
      setPosition(handle.getCurrentPosition());
      setProgress(handle.getProgress());
    });
    return unsubscribe;
  }, [handle]);

  return (
    <div className="flex h-8 shrink-0 items-center justify-end border-t bg-background px-3 text-xs text-muted-foreground">
      <ProgressText position={position} progress={progress} />
    </div>
  );
}

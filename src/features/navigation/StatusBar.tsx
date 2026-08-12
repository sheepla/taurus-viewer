import { useEffect, useState } from "react";
import { useTabStore } from "../tabs/TabStore";
import { useUiModeStore } from "../shell/uiModeStore";
import type {
  DocumentPosition,
  ViewMode,
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

function currentViewMode(handle: DocumentViewerHandle): ViewMode {
  return typeof handle.getViewMode === "function" ? handle.getViewMode() : "scroll";
}

export function StatusBar() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const currentMode = useUiModeStore((s) => s.currentMode);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const handle = activeTab?.handle ?? null;

  if (!activeTab || !handle) {
    if (currentMode !== "NORMAL") {
      return (
        <div
          data-testid="status-bar"
          className="flex h-8 shrink-0 items-center justify-between border-t bg-background px-3 text-xs text-muted-foreground"
        >
          <span className="font-semibold uppercase">{currentMode}</span>
        </div>
      );
    }
    return null;
  }

  return (
    <StatusBarContent
      key={activeTab.id}
      handle={handle}
      currentMode={currentMode}
    />
  );
}

function StatusBarContent({
  handle,
  currentMode,
}: {
  handle: DocumentViewerHandle;
  currentMode: ReturnType<typeof useUiModeStore.getState>["currentMode"];
}) {
  const [position, setPosition] = useState<DocumentPosition>(() =>
    handle.getCurrentPosition(),
  );
  const [progress, setProgress] = useState<number>(() => handle.getProgress());
  const [viewMode] = useState<ViewMode>(() => currentViewMode(handle));

  useEffect(() => {
    const unsubscribe = handle.onPositionChange(() => {
      setPosition(handle.getCurrentPosition());
      setProgress(handle.getProgress());
    });
    return unsubscribe;
  }, [handle]);

  return (
    <div
      data-testid="status-bar"
      className="flex h-8 shrink-0 items-center justify-between border-t bg-background px-3 text-xs text-muted-foreground"
    >
      <div className="flex items-center gap-3">
        <span className="font-semibold uppercase">{currentMode}</span>
        <span className="uppercase tabular-nums">{viewMode}</span>
      </div>
      <ProgressText position={position} progress={progress} />
    </div>
  );
}

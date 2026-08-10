import { createFileRoute } from "@tanstack/react-router";
import { PdfView } from "@/features/pdf-viewer";
import { EpubView } from "@/features/epub-viewer";
import { LibraryView } from "@/features/library";
import { useTabStore } from "@/features/tabs/TabStore";

export const Route = createFileRoute("/")({
  component: ViewerOrLibrary,
});

function ViewerOrLibrary() {
  const { tabs, activeTabId } = useTabStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  if (activeTabId === null || !activeTab) {
    return <LibraryView />;
  }

  if (activeTab.format === "pdf") {
    return <PdfView key={activeTab.id} tabId={activeTab.id} filePath={activeTab.filePath} />;
  }

  if (activeTab.format === "epub") {
    return <EpubView key={activeTab.id} tabId={activeTab.id} filePath={activeTab.filePath} />;
  }

  return <LibraryView />;
}

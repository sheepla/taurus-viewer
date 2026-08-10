import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Library } from "lucide-react";
import { PdfView } from "@/features/pdf-viewer";
import { EpubView } from "@/features/epub-viewer";
import { useTabStore } from "@/features/tabs/TabStore";

export const Route = createFileRoute("/")({
  component: ViewerOrWelcome,
});

function ViewerOrWelcome() {
  const { tabs, activeTabId } = useTabStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  if (activeTab?.format === "pdf") {
    return <PdfView key={activeTab.id} tabId={activeTab.id} filePath={activeTab.filePath} />;
  }

  if (activeTab?.format === "epub") {
    return <EpubView key={activeTab.id} tabId={activeTab.id} filePath={activeTab.filePath} />;
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-8">
      <div className="flex max-w-sm flex-col items-center text-center gap-4">
        <div className="rounded-full bg-muted p-5 text-muted-foreground">
          <BookOpen size={36} />
        </div>
        <h2 className="text-xl font-semibold">No Document Open</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Open a PDF or EPUB from your library to start reading.
        </p>
        <Link
          to="/library"
          className="mt-2 flex items-center gap-2 rounded bg-primary px-4 py-2 text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Library size={16} />
          Open Library
        </Link>
      </div>
    </div>
  );
}

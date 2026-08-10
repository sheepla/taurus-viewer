import { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";
import { EpubViewerHandle } from "./EpubViewerHandle";
import { useTabStore } from "../tabs/TabStore";

interface EpubViewerInnerProps {
  tabId: string;
  filePath: string;
}

export function EpubViewerInner({ tabId, filePath }: EpubViewerInnerProps) {
  const [handle, setHandle] = useState<EpubViewerHandle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chapterContent, setChapterContent] = useState<string>("");
  const [currentChapter, setCurrentChapter] = useState(0);
  const setTabHandle = useTabStore((s) => s.setHandle);

  useEffect(() => {
    const viewerHandle = new EpubViewerHandle(filePath);
    setError(null);
    setLoading(true);

    console.log(`Starting EPUB initialization for: ${filePath}`);

    viewerHandle
      .init()
      .then(() => {
        console.log("EPUB viewer initialized successfully");
        setHandle(viewerHandle);
        setTabHandle(tabId, viewerHandle);
        
        // Load first chapter
        if (viewerHandle.getChapterCount() > 0) {
          return viewerHandle.getChapterContent(0);
        }
        return "<p>No content available</p>";
      })
      .then((content) => {
        setChapterContent(content);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to initialize EPUB viewer:", err);
        setError(err.message || "Unknown error occurred");
        setLoading(false);
      });

    return () => {
      viewerHandle.dispose();
    };
  }, [tabId, filePath, setTabHandle]);

  const loadChapter = async (chapterIndex: number) => {
    if (!handle || chapterIndex < 0 || chapterIndex >= handle.getChapterCount()) {
      return;
    }

    try {
      const content = await handle.getChapterContent(chapterIndex);
      setChapterContent(content);
      setCurrentChapter(chapterIndex);
    } catch (err) {
      console.error("Failed to load chapter:", err);
      setError(`Failed to load chapter ${chapterIndex + 1}`);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground text-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
          <div>Loading EPUB...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-destructive text-sm p-4">
        <BookOpen size={64} className="opacity-30" />
        <div className="text-center max-w-md">
          <div className="font-medium text-lg mb-2">Failed to load EPUB</div>
          <div className="text-xs text-muted-foreground mb-4 p-3 bg-muted/20 rounded">
            {error}
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Please check:</p>
            <ul className="list-disc list-inside space-y-1 text-left">
              <li>File exists and is accessible</li>
              <li>File is a valid EPUB document</li>
              <li>File is not password protected</li>
              <li>File is not corrupted</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (!handle) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-destructive text-sm">
        <div className="font-medium">No EPUB session available</div>
        <div className="text-xs text-muted-foreground">
          EPUB viewer initialization completed but no session was created.
        </div>
      </div>
    );
  }

  const filename = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
  const title = handle.getTitle();
  const author = handle.getAuthor();
  const chapterCount = handle.getChapterCount();

  return (
    <div className="flex h-full w-full flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border p-4 flex-shrink-0">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-xl font-semibold text-foreground mb-1">
            {title !== "Unknown" ? title : filename}
          </h1>
          {author !== "Unknown" && (
            <p className="text-sm text-muted-foreground">by {author}</p>
          )}
          {chapterCount > 1 && (
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => loadChapter(currentChapter - 1)}
                disabled={currentChapter === 0}
                className="px-3 py-1 text-xs border border-border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-xs text-muted-foreground">
                Chapter {currentChapter + 1} of {chapterCount}
              </span>
              <button
                onClick={() => loadChapter(currentChapter + 1)}
                disabled={currentChapter >= chapterCount - 1}
                className="px-3 py-1 text-xs border border-border rounded hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto prose prose-sm dark:prose-invert">
          <div 
            dangerouslySetInnerHTML={{ __html: chapterContent }}
            className="epub-content"
          />
        </div>
      </div>
    </div>
  );
}

import { Suspense, lazy } from "react";
import { BookOpen } from "lucide-react";

const EpubViewerInner = lazy(() =>
  import("./EpubViewerInner").then((m) => ({ default: m.EpubViewerInner }))
);

interface EpubViewProps {
  tabId: string;
  filePath: string;
}

function EpubSkeleton() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 animate-pulse">
      <BookOpen size={48} className="opacity-20" />
      <div className="space-y-2 text-center">
        <div className="h-4 w-40 rounded bg-muted mx-auto" />
        <div className="h-3 w-24 rounded bg-muted mx-auto" />
      </div>
    </div>
  );
}

export function EpubView({ tabId, filePath }: EpubViewProps) {
  return (
    <Suspense fallback={<EpubSkeleton />}>
      <EpubViewerInner tabId={tabId} filePath={filePath} />
    </Suspense>
  );
}

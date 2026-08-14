import type { LibraryEntry, LibraryFolder } from "../../shared/bindings";

export interface LibraryGroup {
  folder: LibraryFolder | null;
  entries: LibraryEntry[];
}

export function folderName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function groupEntriesByFolder(
  folders: LibraryFolder[],
  entries: LibraryEntry[],
): LibraryGroup[] {
  const byFolderId = new Map<number, LibraryEntry[]>();
  for (const entry of entries) {
    const list = byFolderId.get(entry.folder_id) ?? [];
    list.push(entry);
    byFolderId.set(entry.folder_id, list);
  }

  const groups: LibraryGroup[] = folders.map((folder) => ({
    folder,
    entries: byFolderId.get(folder.id) ?? [],
  }));

  const knownIds = new Set(folders.map((folder) => folder.id));
  const orphans = entries.filter((entry) => !knownIds.has(entry.folder_id));
  if (orphans.length > 0) {
    groups.push({ folder: null, entries: orphans });
  }

  return groups;
}

export function flattenLibraryOrder(
  folders: LibraryFolder[],
  entries: LibraryEntry[],
): LibraryEntry[] {
  return groupEntriesByFolder(folders, entries).flatMap((group) => group.entries);
}

export function groupKeyFor(
  entry: LibraryEntry,
  folders: LibraryFolder[],
): string {
  const folder = folders.find((f) => f.id === entry.folder_id);
  return folder ? String(folder.id) : "ungrouped";
}

export type FocusDirection = "up" | "down" | "left" | "right";

export function moveFocusIndex(
  current: number,
  direction: FocusDirection,
  length: number,
  columns: number,
): number {
  if (length <= 0) return 0;
  const clamped = Math.max(0, Math.min(current, length - 1));
  const cols = Math.max(1, columns);

  switch (direction) {
    case "down":
      return Math.min(clamped + cols, length - 1);
    case "up":
      return Math.max(clamped - cols, 0);
    case "left":
      return clamped % cols === 0 ? clamped : clamped - 1;
    case "right":
      return clamped % cols === cols - 1
        ? clamped
        : Math.min(clamped + 1, length - 1);
  }
}
import { describe, expect, it } from "vitest";
import type { LibraryEntry, LibraryFolder } from "../../shared/bindings";
import {
  flattenLibraryOrder,
  folderName,
  groupEntriesByFolder,
  moveFocusIndex,
} from "./libraryOrder";

function folder(id: number, path: string): LibraryFolder {
  return { id, path, added_at: "", last_scanned_at: null };
}

function entry(id: number, folderId: number, title: string): LibraryEntry {
  return {
    id,
    folder_id: folderId,
    path: `/${title}`,
    format: "pdf",
    title,
    size: 0,
    mtime: 0,
    status: "ok",
    error_message: null,
    thumbnail_path: null,
    created_at: "",
    updated_at: "",
  };
}

describe("folderName", () => {
  it("extracts the last path segment for unix paths", () => {
    expect(folderName("/books/manga")).toBe("manga");
  });

  it("extracts the last path segment for windows paths", () => {
    expect(folderName("C:\\Books\\Documents")).toBe("Documents");
  });

  it("handles trailing slashes", () => {
    expect(folderName("/books/manga/")).toBe("manga");
  });

  it("falls back to the full path for a root", () => {
    expect(folderName("/")).toBe("/");
  });
});

describe("groupEntriesByFolder", () => {
  it("groups entries by folder in folder registration order", () => {
    const folders = [folder(1, "/a"), folder(2, "/b")];
    const entries = [
      entry(10, 2, "b1"),
      entry(11, 1, "a1"),
      entry(12, 1, "a2"),
      entry(13, 2, "b2"),
    ];

    const groups = groupEntriesByFolder(folders, entries);
    expect(groups.map((g) => g.folder?.path)).toEqual(["/a", "/b"]);
    expect(groups[0].entries.map((e) => e.title)).toEqual(["a1", "a2"]);
    expect(groups[1].entries.map((e) => e.title)).toEqual(["b1", "b2"]);
  });

  it("groups orphan entries (missing folder) into a fallback group", () => {
    const folders = [folder(1, "/a")];
    const entries = [entry(10, 1, "a1"), entry(99, 7, "orphan")];

    const groups = groupEntriesByFolder(folders, entries);
    expect(groups.length).toBe(2);
    expect(groups[1].folder).toBeNull();
    expect(groups[1].entries.map((e) => e.title)).toEqual(["orphan"]);
  });
});

describe("flattenLibraryOrder", () => {
  it("flattens groups into a single folder-then-entry order", () => {
    const folders = [folder(1, "/a"), folder(2, "/b")];
    const entries = [
      entry(10, 1, "a1"),
      entry(11, 2, "b1"),
      entry(12, 1, "a2"),
    ];

    expect(flattenLibraryOrder(folders, entries).map((e) => e.title)).toEqual([
      "a1",
      "a2",
      "b1",
    ]);
  });
});

describe("moveFocusIndex", () => {
  const length = 10;

  it("moves down by the number of columns", () => {
    expect(moveFocusIndex(0, "down", length, 3)).toBe(3);
  });

  it("clamps down to the last index", () => {
    expect(moveFocusIndex(8, "down", length, 3)).toBe(9);
  });

  it("moves up by the number of columns and clamps at zero", () => {
    expect(moveFocusIndex(5, "up", length, 3)).toBe(2);
    expect(moveFocusIndex(1, "up", length, 3)).toBe(0);
  });

  it("moves left within a row and stays at the row start", () => {
    expect(moveFocusIndex(4, "left", length, 3)).toBe(3);
    expect(moveFocusIndex(3, "left", length, 3)).toBe(3);
  });

  it("moves right within a row and stays at the row end", () => {
    expect(moveFocusIndex(4, "right", length, 3)).toBe(5);
    expect(moveFocusIndex(5, "right", length, 3)).toBe(5);
  });

  it("clamps the current index into range", () => {
    expect(moveFocusIndex(50, "down", length, 3)).toBe(9);
  });

  it("returns zero for an empty list", () => {
    expect(moveFocusIndex(0, "down", 0, 3)).toBe(0);
  });
});

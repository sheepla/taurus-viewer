export type KeybindingEntry = {
  key: string;
  action: string;
  mode: "GLOBAL" | "NORMAL" | "SEARCH" | "TREE" | "BOOKMARKS" | "VISUAL" | "COMMAND";
};

export const KEYBINDINGS: readonly KeybindingEntry[] = [
  { key: "Ctrl+K", action: "Open command palette", mode: "GLOBAL" },
  { key: "?", action: "Open help", mode: "GLOBAL" },
  { key: "Ctrl+,", action: "Open settings", mode: "GLOBAL" },
  { key: "Esc", action: "Return to NORMAL or cancel", mode: "GLOBAL" },
  { key: "o", action: "Open a document", mode: "NORMAL" },
  { key: "v", action: "Enter text selection mode", mode: "NORMAL" },
  { key: "m", action: "Toggle bookmark", mode: "NORMAL" },
  { key: "B", action: "Open bookmarks", mode: "NORMAL" },
  { key: "t", action: "Open outline", mode: "NORMAL" },
  { key: "/", action: "Search in document", mode: "NORMAL" },
  { key: "y", action: "Copy selection", mode: "VISUAL" },
  { key: "j/k", action: "Scroll down/up", mode: "NORMAL" },
  { key: "d/u", action: "Scroll half page down/up", mode: "NORMAL" },
  { key: "f/b", action: "Scroll full page down/up", mode: "NORMAL" },
  { key: "g/G", action: "Go to top/bottom (or first/last page)", mode: "NORMAL" },
  { key: "Home/End", action: "Go to top/bottom (or first/last page)", mode: "NORMAL" },
];

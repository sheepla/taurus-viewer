import { create } from "zustand";

export type UiMode = "NORMAL" | "SEARCH" | "COMMAND" | "TREE" | "BOOKMARKS";

interface UiModeState {
  currentMode: UiMode;
  setMode: (mode: UiMode) => void;
}

export const useUiModeStore = create<UiModeState>((set) => ({
  currentMode: "NORMAL",
  setMode: (mode) => set({ currentMode: mode }),
}));

import { create } from "zustand";

interface LibraryFocusState {
  focusedIndex: number | null;
  setFocusedIndex: (index: number | null) => void;
}

export const useLibraryFocusStore = create<LibraryFocusState>((set) => ({
  focusedIndex: null,
  setFocusedIndex: (index) => set({ focusedIndex: index }),
}));
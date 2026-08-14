import { create } from "zustand";

interface LibraryFocusState {
  focusedIndex: number | null;
  setFocusedIndex: (index: number | null) => void;
  columns: number;
  setColumns: (columns: number) => void;
}

export const useLibraryFocusStore = create<LibraryFocusState>((set) => ({
  focusedIndex: null,
  setFocusedIndex: (index) => set({ focusedIndex: index }),
  columns: 1,
  setColumns: (columns) => set({ columns }),
}));
import { create } from "zustand";

interface LibraryAccordionState {
  openIds: string[];
  setOpenIds: (ids: string[]) => void;
  ensureOpen: (id: string) => void;
}

export const useLibraryAccordionStore = create<LibraryAccordionState>((set) => ({
  openIds: [],
  setOpenIds: (ids) => set({ openIds: ids }),
  ensureOpen: (id) =>
    set((state) =>
      state.openIds.includes(id) ? state : { openIds: [...state.openIds, id] },
    ),
}));
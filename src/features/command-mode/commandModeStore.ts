import { create } from 'zustand';

export type CommandModeState = {
  isOpen: boolean;
  input: string;
  open: () => void;
  close: () => void;
  setInput: (value: string) => void;
};

export const useCommandModeStore = create<CommandModeState>((set) => ({
  isOpen: false,
  input: '',
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, input: '' }),
  setInput: (value) => set({ input: value }),
}));

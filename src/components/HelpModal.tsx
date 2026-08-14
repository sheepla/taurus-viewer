import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { create } from "zustand";
import { KEYBINDINGS } from "@/features/shell/keybindings";

interface HelpState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useHelpModalStore = create<HelpState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));

export function HelpModal() {
  const { isOpen, close } = useHelpModalStore();
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle></DialogHeader>
        <div data-help-scroll className="max-h-96 overflow-y-auto text-sm">
          {KEYBINDINGS.map((binding) => (
            <div key={`${binding.mode}-${binding.key}`} className="grid grid-cols-[7rem_1fr] gap-3 border-b py-2 last:border-0">
              <code>{binding.key}</code>
              <span>{binding.action} ({binding.mode})</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

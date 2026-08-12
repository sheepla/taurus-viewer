import { useEffect } from 'react';
import { useCommandModeStore } from './commandModeStore';
import { useCommandPaletteStore } from './CommandPalette';
import { useUiModeStore } from '../shell/uiModeStore';

export function useCommandMode() {
  const openCommandBar = useCommandModeStore((s) => s.open);
  const closeCommandBar = useCommandModeStore((s) => s.close);
  const isCommandBarOpen = useCommandModeStore((s) => s.isOpen);
  const setCommandBarInput = useCommandModeStore((s) => s.setInput);

  const openPalette = useCommandPaletteStore((s) => s.open);
  const closePalette = useCommandPaletteStore((s) => s.close);
  const isPaletteOpen = useCommandPaletteStore((s) => s.isOpen);

  const setMode = useUiModeStore((s) => s.setMode);
  const currentMode = useUiModeStore((s) => s.currentMode);

  // Keep the COMMAND mode in sync with the command bar visibility.
  useEffect(() => {
    if (isCommandBarOpen) {
      setMode('COMMAND');
    } else if (currentMode === 'COMMAND') {
      setMode('NORMAL');
    }
  }, [isCommandBarOpen, currentMode, setMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      // Ctrl+K — Command Palette (mode-independent overlay)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        if (isPaletteOpen) {
          closePalette();
        } else {
          openPalette();
        }
        return;
      }

      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // `:` key opens command bar with `:` prefilled
      if (e.key === ':') {
        e.preventDefault();
        if (!isCommandBarOpen) {
          openCommandBar();
          setCommandBarInput(':');
        }
      }
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [isCommandBarOpen, openCommandBar, closeCommandBar, setCommandBarInput, isPaletteOpen, openPalette, closePalette]);
}

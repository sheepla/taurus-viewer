import { useEffect } from 'react';
import { useCommandModeStore } from './commandModeStore';

/**
 * Global shortcut hook for command palette.
 * - Ctrl+K / Cmd+K: toggle the command palette open/close.
 * - ':' key (when not in an input): open the palette with ':' prefilled.
 */
export function useCommandMode() {
  const open = useCommandModeStore((s) => s.open);
  const close = useCommandModeStore((s) => s.close);
  const isOpen = useCommandModeStore((s) => s.isOpen);
  const setInput = useCommandModeStore((s) => s.setInput);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;

      // Ctrl+K / Cmd+K — works from anywhere (including when palette is open to close it)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        if (isOpen) {
          close();
        } else {
          open();
        }
        return;
      }

      // Skip ':' key if focus is already on an input/textarea
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // ':' key opens palette with ':' prefilled
      if (e.key === ':') {
        e.preventDefault();
        if (!isOpen) {
          open();
          setInput(':');
        }
      }
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [isOpen, open, close, setInput]);
}

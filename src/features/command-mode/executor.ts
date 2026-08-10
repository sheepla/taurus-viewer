import { toast } from 'sonner';
import type { ParsedCommand } from './CommandParser';
import { useTabStore } from '../tabs/TabStore';
import { invoke } from '@tauri-apps/api/core';

type Theme = 'light' | 'dark' | 'system';

let _setTheme: ((t: Theme) => void) | null = null;
let _openSettings: (() => void) | null = null;

export function registerThemeSetter(fn: (t: Theme) => void) {
  _setTheme = fn;
}

export function registerSettingsOpener(fn: () => void) {
  _openSettings = fn;
}

export function executeCommand(cmd: ParsedCommand): void {
  const store = useTabStore.getState();

  switch (cmd.id) {
    case 'quit': {
      const active = store.activeTabId;
      if (active) {
        store.closeTab(active);
        toast.info('Tab closed');
      } else {
        invoke('plugin:window|close').catch(() => {
          window.close();
        });
      }
      break;
    }

    case 'qall':
      invoke('plugin:window|close').catch(() => {
        window.close();
      });
      break;

    case 'library':
      store.activateTab(null);
      toast.info('Switched to Library');
      break;

    case 'settings':
      if (_openSettings) {
        _openSettings();
      } else {
        toast.error('Settings not available');
      }
      break;

    case 'tab next':
      store.activateNext();
      toast.info('Switched to next tab');
      break;

    case 'tab prev':
      store.activatePrev();
      toast.info('Switched to previous tab');
      break;

    case 'tab close': {
      const active = store.activeTabId;
      if (active) {
        store.closeTab(active);
        toast.info('Tab closed');
      } else {
        toast.warning('No active tab to close');
      }
      break;
    }

    case 'set theme': {
      const value = cmd.args[0]?.toLowerCase() as Theme | undefined;
      const valid: Theme[] = ['light', 'dark', 'system'];
      if (!value || !valid.includes(value)) {
        toast.error(`Invalid theme. Use: light | dark | system`);
        return;
      }
      if (_setTheme) {
        _setTheme(value);
        toast.success(`Theme set to "${value}"`);
      } else {
        toast.error('Theme context not ready');
      }
      break;
    }

    case 'open': {
      const path = cmd.args.join(' ');
      if (!path) {
        import('@tauri-apps/plugin-dialog').then(({ open }) => {
          open({
            multiple: false,
            filters: [{ name: 'Documents', extensions: ['pdf', 'epub'] }]
          }).then((selected) => {
            if (selected && typeof selected === 'string') {
              const ext = selected.split('.').pop()?.toLowerCase();
              const format = ext === 'epub' ? 'epub' : 'pdf';
              store.openTab(selected, format);
              toast.success(`Opened: ${selected.split('/').pop() ?? selected}`);
            }
          }).catch(console.error);
        }).catch(console.error);
        return;
      }
      const ext = path.split('.').pop()?.toLowerCase();
      const format = ext === 'epub' ? 'epub' : 'pdf';
      store.openTab(path, format);
      toast.success(`Opened: ${path.split('/').pop() ?? path}`);
      break;
    }

    case 'help':
      toast.info('Commands: open, quit, qall, library, settings, tab next/prev/close, set theme=<value>');
      break;

    default:
      toast.error(`Unknown command: ${cmd.id}`);
  }
}

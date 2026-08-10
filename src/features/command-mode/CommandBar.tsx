import { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCommandModeStore } from './commandModeStore';
import { COMMANDS } from './commands';
import { parseCommand } from './CommandParser';
import { executeCommand } from './executor';

export function CommandBar() {
  const { isOpen, close, input, setInput } = useCommandModeStore();
  const inputRef = useRef<HTMLInputElement>(null);


  const rawInput = input.replace(/^:/, '').toLowerCase().trim();
  const filtered = rawInput
    ? COMMANDS.filter((c) => c.id.startsWith(rawInput))
    : COMMANDS;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseCommand(input.replace(/^:/, '').trim());
    if (parsed) {
      executeCommand(parsed);
    }
    close();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="px-4 pt-4 pb-2 border-b">
          <DialogTitle className="text-sm font-semibold text-muted-foreground">Command Palette</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-4 pt-3">
          <Input
            ref={inputRef}
            autoFocus
            placeholder=":command [args]"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="font-mono text-sm"
          />
        </form>
        <ul className="my-2 max-h-60 overflow-y-auto px-2 pb-2">
          {filtered.map((cmd) => (
            <li
              key={cmd.id}
              className="flex items-start gap-3 rounded-md px-3 py-2 hover:bg-accent cursor-pointer transition-colors"
              onClick={() => {
                setInput(`:${cmd.id} `);
                inputRef.current?.focus();
              }}
            >
              <span className="font-mono text-xs font-semibold text-primary mt-0.5">:{cmd.id}</span>
              <span className="text-xs text-muted-foreground">{cmd.description}</span>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">No matching commands</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

import { useRef, useEffect } from 'react';
import { useCommandModeStore } from './commandModeStore';
import { COMMANDS } from './commands';
import { parseCommand } from './CommandParser';
import { executeCommand } from './executor';

export function CommandBar() {
  const { isOpen, close, input, setInput } = useCommandModeStore();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

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
    <div className="absolute bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm p-2 shadow-lg">
      <div className="mx-auto max-w-4xl flex flex-col gap-2">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-primary pl-1">:</span>
          <input
            ref={inputRef}
            autoFocus
            placeholder="command [args]"
            value={input.startsWith(':') ? input.slice(1) : input}
            onChange={(e) => setInput(':' + e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent font-mono text-sm outline-none text-foreground placeholder:text-muted-foreground"
          />
        </form>
        {filtered.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
            {filtered.map((cmd) => (
              <button
                key={cmd.id}
                type="button"
                onClick={() => {
                  setInput(`:${cmd.id} `);
                  inputRef.current?.focus();
                }}
                className="rounded bg-muted px-2 py-1 font-mono text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors shrink-0"
              >
                :{cmd.id} - {cmd.description}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

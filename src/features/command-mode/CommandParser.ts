import { COMMANDS } from './commands';

export type ParsedCommand = {
  id: string; // e.g., 'open', 'quit', 'tab next'
  args: string[];
};

/** Simple parser for command strings (without leading ':') */
export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  // Handle multi-word command ids like "tab next"
  const possibleIds = [
    parts.slice(0, 2).join(' '),
    parts[0],
  ];
  for (const id of possibleIds) {
    const cmd = COMMANDS.find((c) => c.id === id);
    if (cmd) {
      const args = parts.slice(id.split(' ').length);
      return { id, args };
    }
  }
  return null;
}

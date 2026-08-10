export type CommandDefinition = {
  id: string; // command name without leading ':'
  description: string;
};

export const COMMANDS: CommandDefinition[] = [
  { id: 'open', description: 'Open a file (e.g., :open path/to/file.pdf)' },
  { id: 'quit', description: 'Quit the application' },
  { id: 'help', description: 'Show help for commands' },
  { id: 'tab next', description: 'Switch to next tab' },
  { id: 'tab prev', description: 'Switch to previous tab' },
  { id: 'tab close', description: 'Close current tab' },
  { id: 'set theme', description: 'Set UI theme, e.g., :set theme=dark' },
];

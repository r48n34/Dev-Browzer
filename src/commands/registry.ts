export interface WorkbenchCommand {
  id: string;
  label: string;
  description: string;
  keywords?: string[];
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
}

export function filterWorkbenchCommands(
  commands: WorkbenchCommand[],
  query: string,
): WorkbenchCommand[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return commands;
  }
  return commands.filter((command) => {
    const haystack = [command.label, command.description, ...(command.keywords ?? [])]
      .join(' ')
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
  );
}

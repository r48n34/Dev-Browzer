import { describe, expect, it } from 'vitest';
import { filterWorkbenchCommands, isEditableShortcutTarget } from './registry';

describe('workbench command helpers', () => {
  const commands = [
    {
      id: 'fit',
      label: 'Fit all previews',
      description: 'Fit the board',
      keywords: ['layout'],
      run: () => undefined,
    },
    {
      id: 'reload',
      label: 'Reload all',
      description: 'Refresh previews',
      run: () => undefined,
    },
  ];

  it('matches command labels, descriptions, and keywords', () => {
    expect(filterWorkbenchCommands(commands, 'layout fit')).toEqual([commands[0]]);
    expect(filterWorkbenchCommands(commands, 'refresh')).toEqual([commands[1]]);
  });

  it('identifies editable shortcut targets', () => {
    const input = document.createElement('input');
    const button = document.createElement('button');
    expect(isEditableShortcutTarget(input)).toBe(true);
    expect(isEditableShortcutTarget(button)).toBe(false);
  });
});

import { useEffect } from 'react';
import { isEditableShortcutTarget } from '../commands/registry';

interface WorkbenchShortcutHandlers {
  openCommands: () => void;
  focusAddress: () => void;
  moveBack: () => void;
  moveForward: () => void;
  reload: () => void;
  exitFocus: () => void;
}

export function useWorkbenchShortcuts({
  openCommands,
  focusAddress,
  moveBack,
  moveForward,
  reload,
  exitFocus,
}: WorkbenchShortcutHandlers) {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (modifier && key === 'k') {
        event.preventDefault();
        openCommands();
        return;
      }
      if (modifier && key === 'l') {
        event.preventDefault();
        focusAddress();
        return;
      }
      if (event.key === 'Escape') {
        exitFocus();
        return;
      }
      if (isEditableShortcutTarget(event.target)) {
        return;
      }
      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        moveBack();
        return;
      }
      if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault();
        moveForward();
        return;
      }
      if (modifier && key === 'r') {
        event.preventDefault();
        reload();
      }
    };

    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [exitFocus, focusAddress, moveBack, moveForward, openCommands, reload]);
}

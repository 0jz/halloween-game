// Pure keyboard reducer (architecture 2.2 Input model, section 3 `createKeyboard`).
// No DOM: input-dom.ts feeds it `KeyboardEvent.code` values and forwards intents.

import type { Intent } from './types.js';

/**
 * Key codes that mean "primary" (start, jump, restart). The DOM adapter also
 * stops their default action, so Space never scrolls the page.
 */
export const PRIMARY_CODES: ReadonlySet<string> = new Set(['Space', 'ArrowUp']);

export interface Keyboard {
  /** `'primary'` on a fresh, non-repeat press of Space or ArrowUp; otherwise `null`. */
  keyDown(code: string, repeat: boolean): Intent | null;
  /** Releases `code`, so its next press counts again. */
  keyUp(code: string): void;
  /** Releases every held key (window blur, page hidden). */
  reset(): void;
}

export function createKeyboard(): Keyboard {
  // Held state is tracked per code, so holding Space does not block ArrowUp.
  const held = new Set<string>();
  return {
    keyDown(code, repeat) {
      if (!PRIMARY_CODES.has(code) || repeat || held.has(code)) return null;
      held.add(code);
      return 'primary';
    },
    keyUp(code) {
      held.delete(code);
    },
    reset() {
      held.clear();
    },
  };
}

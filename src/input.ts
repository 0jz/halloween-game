// Pure keyboard reducer (architecture 2.2 Input model, section 3 `createKeyboard`).
// No DOM: input-dom.ts feeds it `KeyboardEvent.code` values and forwards intents.

import type { Intent } from './types.js';

/**
 * Key codes that mean "primary" (start, jump, restart). The DOM adapter also
 * stops their default action, so Space never scrolls the page.
 */
export const PRIMARY_CODES: ReadonlySet<string> = new Set(['Space', 'ArrowUp']);

/** The duck key. The DOM adapter also stops its default action. */
export const DUCK_CODE = 'ArrowDown';

export interface Keyboard {
  /**
   * `'primary'` on a fresh, non-repeat press of Space or ArrowUp, `'duckDown'`
   * on a fresh, non-repeat press of ArrowDown; otherwise `null`.
   */
  keyDown(code: string, repeat: boolean): Intent | null;
  /** Releases `code`; `'duckUp'` only when ArrowDown was held, else `null`. */
  keyUp(code: string): Intent | null;
  /** Releases every held key (blur, page hidden); `'duckUp'` if ArrowDown was held. */
  reset(): Intent | null;
}

export function createKeyboard(): Keyboard {
  // Held state is tracked per code, so holding Space does not block ArrowUp.
  const held = new Set<string>();
  return {
    keyDown(code, repeat) {
      const isDuck = code === DUCK_CODE;
      if (!(isDuck || PRIMARY_CODES.has(code)) || repeat || held.has(code)) {
        return null;
      }
      held.add(code);
      return isDuck ? 'duckDown' : 'primary';
    },
    keyUp(code) {
      const wasHeld = held.delete(code);
      return wasHeld && code === DUCK_CODE ? 'duckUp' : null;
    },
    reset() {
      const wasDucking = held.has(DUCK_CODE);
      held.clear();
      return wasDucking ? 'duckUp' : null;
    },
  };
}

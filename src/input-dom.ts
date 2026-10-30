// DOM keyboard adapter (technical considerations 2.2, risk "Keyboard focus").
// Listens on the window so the canvas needs no focus, and feeds the pure reducer.

import { DUCK_CODE, PRIMARY_CODES, type Keyboard } from './input.js';
import type { Intent } from './types.js';

/** The slice of `KeyboardEvent` the adapter reads. */
export interface KeyEventLike {
  readonly code: string;
  readonly repeat: boolean;
  preventDefault(): void;
}

/**
 * The slice of `Window` the adapter uses. `window` satisfies it; tests pass a
 * plain fake, so the adapter is unit-testable in Node without casts.
 */
export interface KeyboardTarget {
  addEventListener(
    type: 'keydown' | 'keyup',
    listener: (event: KeyEventLike) => void,
  ): void;
  addEventListener(type: 'blur', listener: () => void): void;
  removeEventListener(
    type: 'keydown' | 'keyup',
    listener: (event: KeyEventLike) => void,
  ): void;
  removeEventListener(type: 'blur', listener: () => void): void;
  readonly document: {
    readonly visibilityState: string;
    addEventListener(type: 'visibilitychange', listener: () => void): void;
    removeEventListener(type: 'visibilitychange', listener: () => void): void;
  };
}

export function attachKeyboard(
  target: KeyboardTarget,
  keyboard: Keyboard,
  onIntent: (intent: Intent) => void,
): { dispose(): void } {
  // Space and the arrows never scroll the page, whatever the reducer decides.
  const prevents = (code: string): boolean =>
    PRIMARY_CODES.has(code) || code === DUCK_CODE;
  const forward = (intent: Intent | null): void => {
    if (intent !== null) onIntent(intent);
  };
  const onKeyDown = (event: KeyEventLike): void => {
    if (prevents(event.code)) event.preventDefault();
    forward(keyboard.keyDown(event.code, event.repeat));
  };
  const onKeyUp = (event: KeyEventLike): void => {
    if (prevents(event.code)) event.preventDefault();
    forward(keyboard.keyUp(event.code));
  };
  // A keyup during alt-tab is never delivered, so release held keys on blur/hide
  // (a held duck key yields a duckUp).
  const onBlur = (): void => {
    forward(keyboard.reset());
  };
  const onVisibility = (): void => {
    if (target.document.visibilityState === 'hidden') forward(keyboard.reset());
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);
  target.document.addEventListener('visibilitychange', onVisibility);

  return {
    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
      target.document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}

import { describe, expect, it } from 'vitest';
import { createKeyboard } from '../src/input.js';
import {
  attachKeyboard,
  type KeyboardTarget,
  type KeyEventLike,
} from '../src/input-dom.js';
import type { Intent } from '../src/types.js';

function setup() {
  const keyListeners: Record<string, (event: KeyEventLike) => void> = {};
  let onBlur: () => void = () => {
    /* unset */
  };
  let onVisibility: () => void = () => {
    /* unset */
  };
  const doc = {
    visibilityState: 'visible',
    addEventListener(_type: 'visibilitychange', listener: () => void) {
      onVisibility = listener;
    },
    removeEventListener() {
      /* unused */
    },
  };
  function addEventListener(
    type: 'keydown' | 'keyup',
    listener: (event: KeyEventLike) => void,
  ): void;
  function addEventListener(type: 'blur', listener: () => void): void;
  function addEventListener(
    type: 'keydown' | 'keyup' | 'blur',
    listener: (event: KeyEventLike) => void,
  ): void {
    if (type === 'blur') {
      // The adapter's blur handler takes no argument; the event is never read.
      onBlur = () => {
        listener({ code: '', repeat: false, preventDefault: () => undefined });
      };
    } else keyListeners[type] = listener;
  }
  const target: KeyboardTarget = {
    addEventListener,
    removeEventListener() {
      /* unused */
    },
    document: doc,
  };
  const intents: Intent[] = [];
  attachKeyboard(target, createKeyboard(), (i) => intents.push(i));
  const key = (type: 'keydown' | 'keyup', code: string, repeat = false) => {
    const event = {
      code,
      repeat,
      defaultPrevented: false,
      preventDefault() {
        event.defaultPrevented = true;
      },
    };
    keyListeners[type]?.(event);
    return event;
  };
  return {
    intents,
    key,
    blur: () => onBlur(),
    hide: () => {
      doc.visibilityState = 'hidden';
      onVisibility();
    },
  };
}

describe('attachKeyboard ducking', () => {
  it('prevents default for ArrowDown and forwards duckDown then duckUp', () => {
    const s = setup();
    expect(s.key('keydown', 'ArrowDown').defaultPrevented).toBe(true);
    expect(s.key('keydown', 'ArrowDown', true).defaultPrevented).toBe(true);
    expect(s.key('keyup', 'ArrowDown').defaultPrevented).toBe(true);
    expect(s.intents).toEqual(['duckDown', 'duckUp']);
  });

  it('forwards duckUp on blur and on tab hidden, only when ducking', () => {
    const idle = setup();
    idle.blur();
    idle.hide();
    expect(idle.intents).toEqual([]);

    const blurred = setup();
    blurred.key('keydown', 'ArrowDown');
    blurred.blur();
    expect(blurred.intents).toEqual(['duckDown', 'duckUp']);

    const hidden = setup();
    hidden.key('keydown', 'ArrowDown');
    hidden.hide();
    expect(hidden.intents).toEqual(['duckDown', 'duckUp']);
  });

  it('a primary key-up forwards nothing', () => {
    const s = setup();
    s.key('keydown', 'Space');
    s.key('keyup', 'Space');
    expect(s.intents).toEqual(['primary']);
  });
});

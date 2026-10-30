// @spec: 001-core-game
// @spec: 002-halloween-edition
// @regression
//
// Feature-level acceptance tests for the criteria of functional-spec.md that
// had no test at the feature boundary after slices 1 to 9 (Feature Testing &
// Regression, slice 10). Each test drives the real createGame, and the key
// tests also the real keyboard reducer and DOM adapter, the way main.ts wires
// them. Every other criterion is covered by the existing suite.

import { describe, expect, it } from 'vitest';
import { createKeyboard } from '../src/input.js';
import {
  attachKeyboard,
  type KeyboardTarget,
  type KeyEventLike,
} from '../src/input-dom.js';
import { MAX_GROUP_SIZE } from '../src/tuning.js';
import {
  collect,
  duckDown,
  duckUp,
  makeGame,
  playBot,
  pressPrimary,
  runUntil,
} from './helpers.js';

/** Keys a player might press that are neither SPACE nor the UP arrow. */
const OTHER_KEYS = [
  'KeyA',
  'Enter',
  'ArrowLeft',
  'ArrowRight',
  'Escape',
  'ShiftLeft',
  'Digit1',
] as const;

/** A fake window for attachKeyboard: lets the test press and release keys. */
function fakeWindow(): {
  target: KeyboardTarget;
  press: (code: string) => void;
} {
  const down = new Set<(event: KeyEventLike) => void>();
  const up = new Set<(event: KeyEventLike) => void>();
  const target: KeyboardTarget = {
    addEventListener(type: string, listener: (event: KeyEventLike) => void) {
      if (type === 'keydown') down.add(listener);
      if (type === 'keyup') up.add(listener);
    },
    removeEventListener(type: string, listener: (event: KeyEventLike) => void) {
      down.delete(listener);
      up.delete(listener);
    },
    document: {
      visibilityState: 'visible',
      addEventListener() {
        // visibility changes are not exercised here
      },
      removeEventListener() {
        // visibility changes are not exercised here
      },
    },
  };
  const press = (code: string): void => {
    const event: KeyEventLike = {
      code,
      repeat: false,
      preventDefault() {
        // the fake page cannot scroll
      },
    };
    for (const listener of down) listener(event);
    for (const listener of up) listener(event);
  };
  return { target, press };
}

/** A game wired to a keyboard exactly as main.ts wires it. */
function keyboardGame(seed: number): {
  made: ReturnType<typeof makeGame>;
  press: (code: string) => void;
} {
  const made = makeGame(seed, { hi: 7 });
  const win = fakeWindow();
  attachKeyboard(win.target, createKeyboard(), (intent) => {
    made.game.dispatch(intent);
  });
  return { made, press: win.press };
}

describe('@spec: 001-core-game @spec: 002-halloween-edition @regression feature acceptance', () => {
  it('@regression 2.1: other keys on the start screen change nothing; SPACE still starts', () => {
    const { made, press } = keyboardGame(42);
    const { game, randomSeed } = made;
    const before = game.state();
    const starts = collect(game, 'start');

    for (const code of OTHER_KEYS) {
      press(code);
      game.tick();
    }

    expect(game.state()).toEqual(before);
    expect(game.state().phase).toBe('idle');
    expect(game.state().hud.hint).toBe('start');
    expect(starts).toEqual([]);
    expect(randomSeed).not.toHaveBeenCalled();

    // The same wiring does start the run on SPACE, so the keys above were heard.
    press('Space');
    game.tick();
    expect(game.state().phase).toBe('running');
    expect(starts).toHaveLength(1);
  });

  it('@regression 2.7: other keys on the game-over screen change nothing; UP still restarts', () => {
    const { made, press } = keyboardGame(42);
    const { game } = made;
    press('Space');
    game.tick();
    runUntil(game, (s) => s.phase === 'dead', 1200);
    const before = game.state();
    const restarts = collect(game, 'restart');

    for (const code of OTHER_KEYS) {
      press(code);
      game.tick();
    }

    expect(game.state()).toEqual(before);
    expect(game.state().hud.gameOver).toBe(true);
    expect(restarts).toEqual([]);

    press('ArrowUp');
    game.tick();
    expect(game.state().phase).toBe('running');
    expect(restarts).toHaveLength(1);
  });

  it('@regression 2.3: every group, including groups of MAX_GROUP_SIZE, is cleared with a single well-timed jump', () => {
    // 30 s of play per seed with collisions on: the run must survive with
    // exactly one jump per group, and the seeds must include full-size groups.
    const PLAY_TICKS = 1800;
    let fullGroupsCleared = 0;
    for (let seed = 0; seed < 40; seed += 1) {
      const { game } = makeGame(seed);
      const deaths = collect(game, 'die');
      pressPrimary(game);

      // Bats arrive from BAT_FIRST_TICK; the bot ducks them so the pumpkin
      // rule is still what is under test.
      const { jumped, jumps } = playBot(game, PLAY_TICKS, { duckBats: true });

      const label = `seed ${String(seed)}`;
      expect(deaths, label).toEqual([]);
      expect(game.state().phase, label).toBe('running');
      expect(game.state().tick, label).toBe(PLAY_TICKS);
      expect(jumps, label).toBe(jumped.size);
      for (const size of jumped.values()) {
        expect(size, label).toBeLessThanOrEqual(MAX_GROUP_SIZE);
        if (size === MAX_GROUP_SIZE) fullGroupsCleared += 1;
      }
    }
    expect(fullGroupsCleared).toBeGreaterThan(0);
  });

  it('@regression 2.1 (duck): ArrowDown on the start screen ducks nothing and does not start; SPACE still starts', () => {
    const { made, press } = keyboardGame(42);
    const { game } = made;
    const before = game.state();
    const starts = collect(game, 'start');
    const ducks = collect(game, 'duckStart');

    press('ArrowDown');
    game.tick();

    expect(game.state()).toEqual(before);
    expect(starts).toEqual([]);
    expect(ducks).toEqual([]);
    press('Space');
    game.tick();
    expect(game.state().phase).toBe('running');
  });

  it('@regression 2.7 (duck): ArrowDown on the game-over screen does not restart; UP still does', () => {
    const { made, press } = keyboardGame(42);
    const { game } = made;
    press('Space');
    game.tick();
    runUntil(game, (s) => s.phase === 'dead', 1200);
    const before = game.state();
    const restarts = collect(game, 'restart');

    press('ArrowDown');
    game.tick();

    expect(game.state()).toEqual(before);
    expect(restarts).toEqual([]);
    press('ArrowUp');
    game.tick();
    expect(game.state().phase).toBe('running');
  });

  it('@regression duck: holding ArrowDown on the ground ducks, releasing stands the dino up', () => {
    const { made } = keyboardGame(42);
    const { game } = made;
    pressPrimary(game);
    const ducks = collect(game, 'duckStart');
    const ends = collect(game, 'duckEnd');

    duckDown(game);
    expect(game.state().dino.pose).toBe('duck');
    expect(ducks).toHaveLength(1);
    duckUp(game);
    expect(game.state().dino.pose).not.toBe('duck');
    expect(ends).toHaveLength(1);
  });
});

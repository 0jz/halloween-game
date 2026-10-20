// @spec: 001-core-game
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
import { JUMP_DURATION_TICKS, MAX_GROUP_SIZE } from '../src/tuning.js';
import type { Game, GameState, Obstacle } from '../src/types.js';
import { collect, makeGame, pressPrimary, runUntil } from './helpers.js';

/** Keys a player might press that are neither SPACE nor the UP arrow. */
const OTHER_KEYS = [
  'KeyA',
  'Enter',
  'ArrowDown',
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

/** The obstacles of the nearest group whose trailing edge is still ahead of the dino's back. */
function nextGroup(state: GameState): readonly Obstacle[] {
  const back = state.dino.hitbox.x;
  const ahead = state.obstacles.filter(
    (o) => o.hitbox.x + o.hitbox.width > back,
  );
  const first = ahead[0];
  if (first === undefined) return [];
  return ahead.filter((o) => o.group === first.group);
}

/**
 * Plays a run with one well-timed jump per group: it presses once, when the
 * middle of the group is half a jump's travel away from the middle of the
 * dino, so the dino is at the top of its jump while above the group. Returns
 * the groups it jumped (by group number and size) and the run's jump count.
 */
function playWellTimed(
  game: Game,
  ticks: number,
  onTick?: (state: GameState) => void,
): { jumped: Map<number, number>; jumps: number } {
  const jumpEvents = collect(game, 'jump');
  const jumped = new Map<number, number>();
  while (game.view().tick < ticks && game.view().phase === 'running') {
    const s = game.view();
    const group = nextGroup(s);
    const lead = group[0];
    const tail = group.at(-1);
    if (lead !== undefined && tail !== undefined && !jumped.has(lead.group)) {
      const groupMid = (lead.hitbox.x + tail.hitbox.x + tail.hitbox.width) / 2;
      const dinoMid = s.dino.hitbox.x + s.dino.hitbox.width / 2;
      if (
        s.dino.onGround &&
        groupMid - dinoMid <= (s.speed * JUMP_DURATION_TICKS) / 2
      ) {
        game.dispatch('primary');
        jumped.set(lead.group, group.length);
      }
    }
    game.tick();
    onTick?.(game.view());
  }
  return { jumped, jumps: jumpEvents.length };
}

describe('@spec: 001-core-game @regression feature acceptance', () => {
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

      const { jumped, jumps } = playWellTimed(game, PLAY_TICKS);

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
});

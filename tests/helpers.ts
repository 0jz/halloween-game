// Shared helpers for acceptance tests that drive createGame (technical
// considerations 4.1): a game with an in-memory store and a scripted seed
// source, a bounded run loop, a primary press, and an event collector.

import { vi, type Mock } from 'vitest';
import { createGame } from '../src/game.js';
import type {
  DrawContext,
  Game,
  GameDeps,
  GameEvent,
  GameState,
  HighScoreStore,
} from '../src/types.js';

/** An in-memory `HighScoreStore` whose `load` and `save` are spies. */
export interface TestStore extends HighScoreStore {
  readonly load: Mock<() => number | null>;
  readonly save: Mock<(score: number) => void>;
}

export function createTestStore(initial: number | null = null): TestStore {
  let hi = initial;
  return {
    load: vi.fn(() => hi),
    save: vi.fn((score: number) => {
      hi = score;
    }),
  };
}

export interface MakeGameOptions {
  /** What the store holds before the game is created (default `null`). */
  readonly hi?: number | null;
  /** Values `randomSeed` returns, in call order; after them it returns the call count. */
  readonly seeds?: readonly number[];
  /** Any `GameDeps` field to use instead of the default (e.g. `collisions: false`, `bus`). */
  readonly deps?: Partial<GameDeps>;
}

export interface TestGame {
  readonly game: Game;
  readonly store: TestStore;
  readonly randomSeed: Mock<() => number>;
  readonly deps: GameDeps;
}

/** Builds a game; `seed` undefined means an unseeded page. */
export function makeGame(
  seed?: number,
  options: MakeGameOptions = {},
): TestGame {
  const store = createTestStore(options.hi ?? null);
  const scripted = options.seeds ?? [];
  let calls = 0;
  const randomSeed = vi.fn(() => {
    const value = scripted[calls] ?? calls + 1;
    calls += 1;
    return value;
  });
  const deps: GameDeps = { seed, randomSeed, store, ...options.deps };
  return { game: createGame(deps), store, randomSeed, deps };
}

/**
 * Steps the game one tick at a time until `predicate` holds for the live
 * view, and returns how many ticks that took. Throws once `maxTicks` steps
 * have run without it holding, so a broken rule fails instead of looping.
 */
export function runUntil(
  game: Game,
  predicate: (state: GameState) => boolean,
  maxTicks: number,
): number {
  for (let ticks = 0; ticks < maxTicks; ticks += 1) {
    if (predicate(game.view())) {
      return ticks;
    }
    game.tick();
  }
  if (predicate(game.view())) {
    return maxTicks;
  }
  throw new Error(
    `runUntil: predicate still false after ${String(maxTicks)} ticks`,
  );
}

/** Dispatches one `primary` intent and runs the step that consumes it. */
export function pressPrimary(game: Game): void {
  game.dispatch('primary');
  game.tick();
}

/** Records every event of `type` from now on, in emission order. */
export function collect<K extends GameEvent['type']>(
  game: Game,
  type: K,
): Extract<GameEvent, { type: K }>[] {
  const events: Extract<GameEvent, { type: K }>[] = [];
  game.on(type, (event) => {
    events.push(event);
  });
  return events;
}

export type Call =
  | { op: 'fillStyle'; value: unknown }
  | { op: 'font'; value: string }
  | { op: 'fillRect'; x: number; y: number; w: number; h: number }
  | { op: 'fillText'; text: string; x: number; y: number }
  | { op: 'translate'; x: number; y: number }
  | { op: 'save' }
  | { op: 'restore' }
  | { op: 'mark'; label: string };

export interface FakeContext extends DrawContext {
  readonly calls: Call[];
}

/** A recording DrawContext: a plain object, no DOM. */
export function fakeContext(): FakeContext {
  const calls: Call[] = [];
  let fillStyle: DrawContext['fillStyle'] = '#000000';
  let font = '10px sans-serif';
  return {
    calls,
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value) {
      fillStyle = value;
      calls.push({ op: 'fillStyle', value });
    },
    get font() {
      return font;
    },
    set font(value) {
      font = value;
      calls.push({ op: 'font', value });
    },
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    fillRect(x, y, w, h) {
      calls.push({ op: 'fillRect', x, y, w, h });
    },
    fillText(text, x, y) {
      calls.push({ op: 'fillText', text, x, y });
    },
    translate(x, y) {
      calls.push({ op: 'translate', x, y });
    },
    save() {
      calls.push({ op: 'save' });
    },
    restore() {
      calls.push({ op: 'restore' });
    },
  };
}

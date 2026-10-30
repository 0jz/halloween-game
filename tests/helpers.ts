// Shared helpers for acceptance tests that drive createGame (technical
// considerations 4.1): a game with an in-memory store and a scripted seed
// source, a bounded run loop, a primary press, and an event collector.

import { vi, type Mock } from 'vitest';
import { createGame } from '../src/game.js';
import { JUMP_DURATION_TICKS } from '../src/tuning.js';
import type {
  DrawContext,
  Game,
  GameDeps,
  GameEvent,
  GameState,
  HighScoreStore,
  Obstacle,
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

/** Dispatches one `duckDown` intent and runs the step that consumes it. */
export function duckDown(game: Game): void {
  game.dispatch('duckDown');
  game.tick();
}

/** Dispatches one `duckUp` intent and runs the step that consumes it. */
export function duckUp(game: Game): void {
  game.dispatch('duckUp');
  game.tick();
}

export interface PlayBotOptions {
  /** Hold duck while a bat is about to reach the dino (default false). */
  readonly duckBats?: boolean;
  /**
   * Jump for the witch's hat. Accepted and ignored until slice 5 adds hats;
   * it is part of the signature now so tests need not change then.
   */
  readonly catchHat?: boolean;
}

export interface PlayBotResult {
  /** Group number to group size, for every group the bot jumped. */
  readonly jumped: Map<number, number>;
  readonly jumps: number;
}

/** The obstacles of the nearest group whose trailing edge is still ahead of the dino's back. */
function nextGroupAhead(state: GameState): readonly Obstacle[] {
  const back = state.dino.hitbox.x;
  const ahead = state.obstacles.filter(
    (o) => o.hitbox.x + o.hitbox.width > back,
  );
  const first = ahead[0];
  if (first === undefined) return [];
  return ahead.filter((o) => o.group === first.group);
}

/**
 * Plays a run until `ticks` or death: one well-timed jump per pumpkin group
 * (pressed when the group's middle is half a jump's travel from the dino's
 * middle) and, with `duckBats`, ducking from just before a bat reaches the
 * dino until its trailing edge has passed. It never ducks while jumping.
 */
export function playBot(
  game: Game,
  ticks: number,
  options: PlayBotOptions = {},
): PlayBotResult {
  const jumpEvents = collect(game, 'jump');
  const jumped = new Map<number, number>();
  let ducking = false;
  while (game.view().tick < ticks && game.view().phase === 'running') {
    const s = game.view();
    const dinoMid = s.dino.hitbox.x + s.dino.hitbox.width / 2;
    const group = nextGroupAhead(s);
    const lead = group[0];
    const tail = group.at(-1);
    if (lead !== undefined && tail !== undefined && !jumped.has(lead.group)) {
      const groupMid = (lead.hitbox.x + tail.hitbox.x + tail.hitbox.width) / 2;
      if (
        s.dino.onGround &&
        !ducking &&
        groupMid - dinoMid <= (s.speed * JUMP_DURATION_TICKS) / 2
      ) {
        game.dispatch('primary');
        jumped.set(lead.group, group.length);
      }
    }
    if (options.duckBats === true) {
      // Duck from 12 ticks of travel out until the bat's trailing edge passes.
      const needsDuck = s.bats.some(
        (b) =>
          b.hitbox.x + b.hitbox.width > s.dino.hitbox.x &&
          b.hitbox.x - (s.dino.hitbox.x + s.dino.hitbox.width) <= s.speed * 12,
      );
      if (needsDuck && !ducking && s.dino.onGround) {
        game.dispatch('duckDown');
        ducking = true;
      } else if (!needsDuck && ducking) {
        game.dispatch('duckUp');
        ducking = false;
      }
    }
    game.tick();
  }
  return { jumped, jumps: jumpEvents.length };
}

// @spec: 002-halloween-edition
// @regression
//
// Feature-level acceptance tests for the criteria of functional-spec.md
// (sections 2.4, 2.5, 2.8, 2.9, 2.10 and 2.11) that no earlier slice proved at
// the feature boundary. Each test drives the real createGame (and, for the
// wiring tests, the real night sky, reactions and layer stack) with seeds and
// a scripted bot. Every other criterion is covered by the per-slice suites.

import { describe, expect, it } from 'vitest';
import { intersects } from '../src/collision.js';
import { installNightSky } from '../src/features/night-sky.js';
import { installReactions } from '../src/features/reactions.js';
import { createLayerStack } from '../src/render.js';
import {
  HAT_CLEAR_TICKS,
  INVULN_TICKS,
  minGapPx,
  PALETTE,
  START_SPEED,
} from '../src/tuning.js';
import type { DrawContext, Game, GameState } from '../src/types.js';
import { collect, makeGame, playBot, pressPrimary } from './helpers.js';

/** Three minutes at 60 steps per second (spec 2.11). */
const THREE_MINUTES = 180 * 60;
const SEEDS = [1, 2, 3, 5, 7, 11, 13, 42, 99, 2024] as const;

/** Every bat, hat and candy spawn of a run, as `kind@tick:x` stamps. */
interface Course {
  readonly bats: string[];
  readonly hats: string[];
  readonly candies: string[];
}

/** Records the spawns whose tick is at most `upTo`, from now on, into a fresh course. */
function recordCourse(game: Game, upTo: number): Course {
  const course: Course = { bats: [], hats: [], candies: [] };
  const stamp = (x: number): string =>
    `${String(game.view().tick)}:${String(x)}`;
  game.on('batSpawn', (e) => {
    if (game.view().tick <= upTo) course.bats.push(stamp(e.bat.x));
  });
  game.on('hatSpawn', (e) => {
    if (game.view().tick <= upTo) course.hats.push(stamp(e.hat.x));
  });
  game.on('candySpawn', (e) => {
    if (game.view().tick <= upTo) course.candies.push(stamp(e.candy.x));
  });
  return course;
}

/** Ticks without input until the run ends (bounded, so a bug fails instead of hanging). */
function runToDeath(game: Game, cap = 6000): void {
  for (let i = 0; i < cap && game.view().phase === 'running'; i += 1) {
    game.tick();
  }
  expect(game.view().phase).toBe('dead');
}

describe('2.11 fairness: a player who reacts well is never forced into a crash', () => {
  it.each([
    ['jumping every pumpkin group and ducking every bat', false],
    ['also jumping for every witch hat', true],
  ])('survives 3 minutes on ten seeds %s', (_label, catchHat) => {
    for (const seed of SEEDS) {
      const { game } = makeGame(seed);
      pressPrimary(game);
      const lost = collect(game, 'heartLost');
      const died = collect(game, 'die');
      playBot(game, THREE_MINUTES, { duckBats: true, catchHat });
      const s = game.view();
      expect(
        { seed, phase: s.phase, tick: s.tick, lost: lost.length },
        `seed ${String(seed)}`,
      ).toEqual({ seed, phase: 'running', tick: THREE_MINUTES, lost: 0 });
      expect(died).toHaveLength(0);
    }
  });
});

describe('2.7 fairness: bats keep a safe distance from pumpkins and from each other', () => {
  it('leaves a jump plus half a second between a bat and a pumpkin, and a second between two bats, whichever appears second', () => {
    // Listener assertions would only surface as unhandled errors, so the
    // shortfalls are collected and asserted after the run.
    const shortfalls: string[] = [];
    const seen = { batAfterPumpkin: 0, pumpkinAfterBat: 0, batAfterBat: 0 };
    for (const seed of SEEDS) {
      const { game } = makeGame(seed, { deps: { collisions: false } });
      pressPrimary(game);
      const check = (what: string, gap: number, need: number): void => {
        if (gap < need - 1e-6) {
          shortfalls.push(
            `seed ${String(seed)} tick ${String(game.view().tick)} ${what}: gap ${String(gap)} < ${String(need)}`,
          );
        }
      };
      game.on('batSpawn', (e) => {
        const s = game.view();
        for (const o of s.obstacles) {
          seen.batAfterPumpkin += 1;
          check(
            'bat after pumpkin',
            e.bat.x - (o.x + o.width),
            minGapPx(s.speed),
          );
        }
        for (const b of s.bats) {
          if (b.id === e.bat.id) continue;
          seen.batAfterBat += 1;
          check('bat after bat', e.bat.x - (b.x + b.width), s.speed * 60);
        }
      });
      game.on('spawn', (e) => {
        const s = game.view();
        for (const b of s.bats) {
          seen.pumpkinAfterBat += 1;
          check(
            'pumpkin after bat',
            e.obstacle.x - (b.x + b.width),
            minGapPx(s.speed),
          );
        }
      });
      game.tick(THREE_MINUTES);
    }
    expect(shortfalls).toEqual([]);
    expect(seen.batAfterPumpkin).toBeGreaterThan(0);
    expect(seen.pumpkinAfterBat).toBeGreaterThan(0);
  });
});

describe('2.8 fairness: nothing is placed where it makes the hat unreachable', () => {
  it('keeps pumpkins and bats a hat-clearance away from every hat, whichever appears second', () => {
    // Listener assertions would only surface as unhandled errors, so the
    // shortfalls are collected and asserted after the run.
    const shortfalls: string[] = [];
    let checks = 0;
    let pumpkinsAfterHat = 0;
    for (const seed of SEEDS) {
      // Never dies and never jumps, so hats are missed and keep coming back.
      const { game } = makeGame(seed, { deps: { collisions: false } });
      pressPrimary(game);
      const check = (what: string, gap: number, slack: number): void => {
        const s = game.view();
        const need = HAT_CLEAR_TICKS * s.speed - slack;
        checks += 1;
        if (gap < need - 1e-6) {
          shortfalls.push(
            `seed ${String(seed)} tick ${String(s.tick)} ${what}: gap ${String(gap)} < ${String(need)}`,
          );
        }
      };
      game.on('hatSpawn', (e) => {
        for (const o of [...game.view().obstacles, ...game.view().bats]) {
          check('hat after obstacle', e.hat.x - (o.x + o.width), 0);
        }
      });
      // A pumpkin or bat spawns within one step of the right edge.
      const afterHat = (what: string, x: number): void => {
        const hat = game.view().hat;
        if (hat === null) return;
        check(what, x - (hat.x + hat.width), game.view().speed);
      };
      game.on('spawn', (e) => {
        if (game.view().hat !== null) pumpkinsAfterHat += 1;
        afterHat('pumpkin after hat', e.obstacle.x);
      });
      game.on('batSpawn', (e) => {
        afterHat('bat after hat', e.bat.x);
      });
      game.tick(THREE_MINUTES);
    }
    expect(shortfalls).toEqual([]);
    expect(checks).toBeGreaterThan(0);
    expect(pumpkinsAfterHat).toBeGreaterThan(0);
  });
});

describe('2.9 hearts through a whole run', () => {
  it('spends one heart per mistake, 1.5 s apart, then ends the run and saves the best score', () => {
    for (let seed = 1; seed < 60; seed += 1) {
      const made = makeGame(seed);
      const { game, store } = made;
      pressPrimary(game);
      const lost = collect(game, 'heartLost');
      const died = collect(game, 'die');
      playBot(game, 9000, {
        catchHat: true,
        duckBats: true,
        stopWhen: (s) => s.hearts >= 2,
      });
      if (game.view().hearts < 2 || game.view().phase !== 'running') continue;

      const heldHearts = game.view().hearts;
      const ticks: number[] = [];
      game.on('heartLost', () => ticks.push(game.view().tick));
      let dieTick = -1;
      game.on('die', () => {
        dieTick = game.view().tick;
      });
      runToDeath(game);

      // At least the hearts held were spent, one per mistake, never two at once.
      expect(lost.length).toBeGreaterThanOrEqual(heldHearts);
      for (let i = 1; i < ticks.length; i += 1) {
        expect(
          (ticks[i] ?? 0) - (ticks[i - 1] ?? 0),
          'two heartLost events closer than the protection',
        ).toBeGreaterThanOrEqual(INVULN_TICKS);
      }
      // The crash with no hearts left comes after the last protection ended.
      expect(died).toHaveLength(1);
      expect(game.view().hearts).toBe(0);
      expect(dieTick - (ticks.at(-1) ?? 0)).toBeGreaterThanOrEqual(
        INVULN_TICKS,
      );
      // Hearts never touch the best score: it is saved as in the core game.
      const final = died[0];
      expect(final?.score).toBe(game.view().score);
      expect(store.save).toHaveBeenCalledTimes(1);
      expect(store.save).toHaveBeenCalledWith(game.view().score);
      return;
    }
    throw new Error('no seed gave a run holding two hearts');
  });

  it('loses a heart, and the run goes on, when a bat is hit', () => {
    for (let seed = 1; seed < 80; seed += 1) {
      const { game } = makeGame(seed);
      pressPrimary(game);
      const died = collect(game, 'die');
      playBot(game, 9000, {
        catchHat: true,
        duckBats: true,
        stopWhen: (s) => s.hearts >= 1,
      });
      if (game.view().hearts < 1 || game.view().phase !== 'running') continue;

      // From here the dino jumps pumpkins but never ducks, so a bat will hit.
      const batHit: { state: GameState | null } = { state: null };
      game.on('heartLost', () => {
        const s = game.view();
        if (s.bats.some((b) => intersects(s.dino.hitbox, b.hitbox))) {
          batHit.state = s;
        }
      });
      playBot(game, 12000, { stopWhen: () => batHit.state !== null });
      const hit = batHit.state;
      if (hit === null) continue;
      expect(hit.phase).toBe('running');
      expect(hit.invulnTicks).toBe(INVULN_TICKS);
      expect(died).toHaveLength(0);
      expect(game.view().phase).toBe('running');
      return;
    }
    throw new Error('no seed gave a bat hit while holding a heart');
  });
});

describe('2.10 restarting and replaying the same course', () => {
  it('plays the same bats, hat and candies on a second run with the same seed', () => {
    const { game } = makeGame(42);
    const upTo = 6000;
    const first = recordCourse(game, upTo);
    pressPrimary(game);
    playBot(game, upTo, { catchHat: true, duckBats: true });
    const run1: Course = {
      bats: [...first.bats],
      hats: [...first.hats],
      candies: [...first.candies],
    };
    runToDeath(game);
    expect(run1.bats.length).toBeGreaterThan(0);
    expect(run1.hats.length).toBeGreaterThan(0);
    expect(run1.candies.length).toBeGreaterThan(0);

    const before = {
      bats: first.bats.length,
      hats: first.hats.length,
      candies: first.candies.length,
    };
    pressPrimary(game);
    playBot(game, upTo, { catchHat: true, duckBats: true });
    // The recorder keeps appending; the second run's spawns are the new tail.
    expect(first.bats.slice(before.bats)).toEqual(run1.bats);
    expect(first.hats.slice(before.hats)).toEqual(run1.hats);
    expect(first.candies.slice(before.candies)).toEqual(run1.candies);
  });

  it('plays different bats, hats and candies on a different seed', () => {
    const courseOf = (seed: number): Course => {
      const { game } = makeGame(seed, { deps: { collisions: false } });
      const course = recordCourse(game, 6000);
      pressPrimary(game);
      playBot(game, 6000, { catchHat: true });
      return course;
    };
    const a = courseOf(42);
    const b = courseOf(43);
    expect(a.bats.length).toBeGreaterThan(0);
    expect(a.candies.length).toBeGreaterThan(0);
    expect(a.bats).not.toEqual(b.bats);
    expect(a.candies).not.toEqual(b.candies);

    // A hat that is never caught returns after seed-drawn delays.
    const hatsOf = (seed: number): string[] => {
      const { game } = makeGame(seed, { deps: { collisions: false } });
      const course = recordCourse(game, 9000);
      pressPrimary(game);
      game.tick(9000);
      return course.hats;
    };
    expect(hatsOf(42)).not.toEqual(hatsOf(43));
  });

  it('makes the tenth run behave exactly like the first', () => {
    const { game } = makeGame(42);
    const jumps = collect(game, 'jump');
    interface Run {
      readonly speed: number;
      readonly jumps: number;
      readonly deathTick: number;
      readonly deathScore: number;
    }
    const runs: Run[] = [];
    for (let i = 0; i < 10; i += 1) {
      jumps.length = 0;
      pressPrimary(game); // starts the first run, restarts the others
      const speed = game.view().speed;
      // Two presses in one step still make exactly one jump.
      game.dispatch('primary');
      game.dispatch('primary');
      game.tick();
      const jumpCount = jumps.length;
      runToDeath(game);
      runs.push({
        speed,
        jumps: jumpCount,
        deathTick: game.view().tick,
        deathScore: game.view().score,
      });
    }
    const first = runs[0];
    expect(first?.speed).toBe(START_SPEED);
    expect(first?.jumps).toBe(1);
    expect(runs[9]).toEqual(first);
  });
});

describe('2.4 and 2.5 the night and its reactions never change play, and stay in the palette', () => {
  /** A bot-played run to a crash; `onTick` runs after every step. */
  function play(game: Game, onTick: () => void): void {
    game.on('tick', onTick);
    pressPrimary(game);
    playBot(game, 3200, { catchHat: true, duckBats: true });
    runToDeath(game);
    game.tick(120); // the frozen game-over screen keeps being drawn
  }

  function wired(game: Game): () => void {
    const stack = createLayerStack();
    installNightSky({ game, renderer: stack });
    installReactions({ game, renderer: stack });
    return () => {
      stack.run(contextOf(), game.view());
    };
  }

  const styles = new Set<unknown>();
  function contextOf(): DrawContext {
    let style: DrawContext['fillStyle'] = '#000000';
    const noop = (): void => undefined;
    return {
      get fillStyle() {
        return style;
      },
      set fillStyle(value) {
        style = value;
        styles.add(value);
      },
      globalAlpha: 1,
      font: '10px sans-serif',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      fillRect: noop,
      fillText: noop,
      translate: noop,
      save: noop,
      restore: noop,
    };
  }

  const trace = (game: Game, into: string[]) => () => {
    const s = game.view();
    into.push(
      [
        s.tick,
        s.phase,
        s.score,
        s.speed,
        s.dino.y,
        s.dino.pose,
        s.hearts,
        s.obstacles.length,
        s.bats.length,
      ].join(':'),
    );
  };

  it('leaves every step of the game identical with the sky and reactions installed', () => {
    const bare: string[] = [];
    const bareGame = makeGame(42).game;
    play(bareGame, trace(bareGame, bare));

    const dressed: string[] = [];
    const dressedGame = makeGame(42).game;
    dressedGame.on('tick', wired(dressedGame));
    play(dressedGame, trace(dressedGame, dressed));

    expect(bare.length).toBeGreaterThan(3000);
    expect(dressed).toEqual(bare);
  });

  it('draws every frame of a run, a crash and the game-over screen in PALETTE colours only', () => {
    styles.clear();
    const game = makeGame(42).game;
    game.on('tick', wired(game));
    play(game, () => undefined);
    expect(styles.size).toBeGreaterThan(3);
    const allowed = new Set<unknown>(Object.values(PALETTE));
    for (const style of styles) expect(allowed.has(style)).toBe(true);
  });
});

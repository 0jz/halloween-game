// @spec: 002-halloween-edition (2.8 witch hat, 2.9 candies and hearts,
// 2.10 protection, 2.11 restart). Drives createGame with a seed and tick(n).

import { describe, expect, it } from 'vitest';
import {
  GROUND_Y,
  HAT_FIRST_TICK,
  INVULN_BLINK_TICKS,
  INVULN_TICKS,
  MAX_HEARTS,
} from '../src/tuning.js';
import type { Game } from '../src/types.js';
import { collect, makeGame, playBot, pressPrimary } from './helpers.js';

const SEED = 42;
/** Ticks by which the bot has caught the hat. */
const CATCH_BY_TICK = 3600;
/** Ten seconds in ticks: the spec's bound for the first candy after the catch. */
const TEN_SECONDS = 600;

/** A started game that cannot die (long runs, no input). */
function startImmortal(seed = SEED): Game {
  const { game } = makeGame(seed, { deps: { collisions: false } });
  pressPrimary(game);
  return game;
}

/** Plays the bot one tick at a time until the hat is caught or the run ends. */
function playUntilCaught(game: Game, stopAtHeart = false): boolean {
  const caught = collect(game, 'hatCaught');
  playBot(game, CATCH_BY_TICK + 1200, {
    catchHat: true,
    duckBats: true,
    stopWhen: (state) => (stopAtHeart ? state.hearts > 0 : caught.length > 0),
  });
  return caught.length > 0;
}

/** An immortal game played by the bot until the hat is caught. */
function caughtImmortal(seed = SEED): Game {
  const game = startImmortal(seed);
  const caught = collect(game, 'hatCaught');
  playBot(game, CATCH_BY_TICK, { catchHat: true });
  expect(caught).toHaveLength(1);
  return game;
}

describe('2.8 the witch hat', () => {
  it('never appears before tick HAT_FIRST_TICK, and does at or after it', () => {
    const game = startImmortal();
    const hats = collect(game, 'hatSpawn');
    game.tick(HAT_FIRST_TICK - 1);
    expect(hats).toHaveLength(0);
    expect(game.view().hat).toBeNull();
    game.tick(300);
    expect(hats).toHaveLength(1);
    expect(game.view().tick).toBeGreaterThanOrEqual(HAT_FIRST_TICK);
  });

  it('is never caught by a dino that stays on the ground', () => {
    const game = startImmortal();
    const hats = collect(game, 'hatSpawn');
    const caught = collect(game, 'hatCaught');
    game.tick(CATCH_BY_TICK);
    expect(hats.length).toBeGreaterThan(0);
    expect(caught).toHaveLength(0);
    expect(game.view().candyTime).toBe(false);
  });

  it('is caught by jumping into it, with the dino in the air', () => {
    const game = startImmortal();
    let airborne: boolean | null = null;
    game.on('hatCaught', () => {
      airborne = !game.view().dino.onGround;
    });
    playBot(game, CATCH_BY_TICK, { catchHat: true });
    expect(airborne).toBe(true);
    const s = game.view();
    expect(s.hat).toBeNull();
    expect(s.candyTime).toBe(true);
  });

  it('is only one per run: none spawns again after a catch', () => {
    const game = caughtImmortal();
    const hats = collect(game, 'hatSpawn');
    game.tick(6000);
    expect(hats).toHaveLength(0);
    expect(game.view().hat).toBeNull();
  });

  it('keeps returning when missed: a hat that leaves uncaught is followed by another', () => {
    const game = startImmortal();
    const hats = collect(game, 'hatSpawn');
    game.tick(8000);
    expect(hats.length).toBeGreaterThan(1);
  });
});

describe('2.9 candies and hearts', () => {
  it('has no candy before the hat is caught', () => {
    const game = startImmortal();
    const candies = collect(game, 'candySpawn');
    game.tick(CATCH_BY_TICK);
    expect(candies).toHaveLength(0);
    expect(game.view().candies).toEqual([]);
  });

  it('puts a candy on the ground within 10 s of the catch', () => {
    const game = caughtImmortal();
    const catchTick = game.view().tick;
    const candies = collect(game, 'candySpawn');
    const ticks: number[] = [];
    game.on('candySpawn', () => ticks.push(game.view().tick));
    game.tick(TEN_SECONDS);
    const first = candies[0];
    expect(first).toBeDefined();
    expect(ticks[0]).toBeLessThanOrEqual(catchTick + TEN_SECONDS);
    expect((first?.candy.y ?? 0) + (first?.candy.height ?? 0)).toBe(GROUND_Y);
  });

  it('gives one heart per candy eaten and never more than MAX_HEARTS', () => {
    const game = startImmortal();
    const eaten = collect(game, 'candyEaten');
    playBot(game, CATCH_BY_TICK, { catchHat: true });
    game.tick(6000);
    expect(eaten.length).toBeGreaterThan(MAX_HEARTS);
    expect(eaten.slice(0, 3).map((e) => e.hearts)).toEqual([1, 2, 3]);
    expect(Math.max(...eaten.map((e) => e.hearts))).toBe(MAX_HEARTS);
    expect(game.view().hearts).toBe(MAX_HEARTS);
  });
});

interface HeartLossRun {
  readonly game: Game;
  readonly lost: readonly { readonly hearts: number }[];
  readonly died: readonly unknown[];
}

/** A mortal run: bot until a heart is held, then no jumps until it is lost or the run ends. */
function heartLossRun(seed: number): HeartLossRun | null {
  const { game } = makeGame(seed);
  pressPrimary(game);
  const lost = collect(game, 'heartLost');
  const died = collect(game, 'die');
  if (!playUntilCaught(game, true) || game.view().hearts === 0) return null;
  while (game.view().phase === 'running' && lost.length === 0) {
    game.tick();
  }
  return lost.length === 0 ? null : { game, lost, died };
}

function findHeartLossRun(): HeartLossRun {
  for (let seed = 1; seed < 60; seed += 1) {
    const run = heartLossRun(seed);
    if (run !== null) return run;
  }
  throw new Error('no seed produced a heart loss');
}

describe('2.8 and 2.9 placement', () => {
  it('never puts a hat or candy on top of a pumpkin or bat', () => {
    for (const seed of [1, 7, 42, 2024]) {
      const game = startImmortal(seed);
      const pickups: { x: number; width: number }[] = [];
      game.on('hatSpawn', (e) => pickups.push(e.hat));
      game.on('candySpawn', (e) => pickups.push(e.candy));
      const clashes: number[] = [];
      for (let t = 0; t < 9000; t += 1) {
        const before = pickups.length;
        game.tick();
        const s = game.view();
        if (pickups.length > before) {
          const spawned = pickups[pickups.length - 1];
          const blockers = [...s.obstacles, ...s.bats].filter(
            (o) =>
              o.hitbox.x < (spawned?.x ?? 0) + (spawned?.width ?? 0) &&
              (spawned?.x ?? 0) < o.hitbox.x + o.hitbox.width,
          );
          clashes.push(blockers.length);
        }
        // Candy time arrives only by catching; keep the loop cheap.
        if (t === 2000 && pickups.length === 0) break;
      }
      expect(pickups.length).toBeGreaterThan(0);
      expect(clashes.every((n) => n === 0)).toBe(true);
    }
  });
});

describe('2.9 and 2.10 losing a heart', () => {
  it('spends a heart without dying and starts INVULN_TICKS of protection', () => {
    const { game, lost, died } = findHeartLossRun();
    const s = game.view();
    expect(died).toHaveLength(0);
    expect(s.phase).toBe('running');
    expect(lost[0]?.hearts).toBe(s.hearts);
    expect(s.invulnTicks).toBe(INVULN_TICKS);
    expect(s.hud.dinoVisible).toBe(false);
  });

  it('ignores hits during protection, counts down, and blinks the dino', () => {
    const { game, died } = findHeartLossRun();
    const seenVisible: boolean[] = [];
    for (let i = 1; i <= INVULN_TICKS; i += 1) {
      game.tick();
      const s = game.view();
      expect(s.invulnTicks).toBe(INVULN_TICKS - i);
      expect(s.phase).toBe('running');
      seenVisible.push(s.hud.dinoVisible);
    }
    expect(died).toHaveLength(0);
    expect(seenVisible.slice(0, INVULN_BLINK_TICKS - 1)).toEqual(
      Array<boolean>(INVULN_BLINK_TICKS - 1).fill(false),
    );
    expect(seenVisible).toContain(true);
    expect(game.view().hud.dinoVisible).toBe(true);
  });
});

describe('2.9 no hearts', () => {
  it('ends the run with die and no heartLost when a crash finds no heart', () => {
    const { game } = makeGame(SEED);
    pressPrimary(game);
    const lost = collect(game, 'heartLost');
    const died = collect(game, 'die');
    game.tick(600);
    expect(game.view().phase).toBe('dead');
    expect(died).toHaveLength(1);
    expect(lost).toHaveLength(0);
    expect(game.view().hearts).toBe(0);
  });

  it('keeps the score independent of hearts', () => {
    // The score is a function of the ticks alone: a run that has gained and
    // spent a heart scores the same as an untouched run at the same tick.
    const { game, lost } = findHeartLossRun();
    expect(lost.length).toBeGreaterThan(0);
    const scores: number[] = [];
    game.on('tick', () => scores.push(game.view().score));
    const startTick = game.view().tick;
    game.tick(INVULN_TICKS);
    expect(game.view().phase).toBe('running');

    const plain = startImmortal();
    const expected: number[] = [];
    plain.on('tick', () => expected.push(plain.view().score));
    plain.tick(game.view().tick);
    expect(game.view().score).toBe(plain.view().score);
    expect(scores).toEqual(expected.slice(startTick, game.view().tick));
  });
});

describe('2.11 restart', () => {
  it('resets hat, candies, hearts, candy time and protection, and replays the hat', () => {
    const { game } = makeGame(SEED);
    pressPrimary(game);
    const candies = collect(game, 'candySpawn');
    const hatTicks: number[] = [];
    game.on('hatSpawn', () => hatTicks.push(game.view().tick));
    expect(playUntilCaught(game, true)).toBe(true);
    // Run on without jumping until the run ends.
    while (game.view().phase === 'running') game.tick();
    expect(hatTicks.length).toBeGreaterThan(0);
    expect(candies.length).toBeGreaterThan(0);

    pressPrimary(game);
    const s = game.view();
    expect(s.phase).toBe('running');
    expect(s.hat).toBeNull();
    expect(s.candies).toEqual([]);
    expect(s.hearts).toBe(0);
    expect(s.candyTime).toBe(false);
    expect(s.invulnTicks).toBe(0);
    expect(s.hud.dinoVisible).toBe(true);

    const firstRunTick = hatTicks[0];
    hatTicks.length = 0;
    playBot(game, HAT_FIRST_TICK + 5, { duckBats: true });
    expect(hatTicks[0]).toBe(firstRunTick);
  });
});

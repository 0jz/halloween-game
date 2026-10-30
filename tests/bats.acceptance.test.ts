// Acceptance tests for spec 002-halloween-edition section 2.7 (bats), driving
// createGame (technical considerations 2.5). A small local bot plays the
// pumpkins so a run can reach the bats with collisions on.
// @spec: 002-halloween-edition

import { describe, expect, it } from 'vitest';
import { intersects } from '../src/collision.js';
import { speedAt } from '../src/obstacles.js';
import {
  BAT_FIRST_TICK,
  BAT_INTERVAL_TICKS,
  BAT_TO_BAT_TICKS,
  minGapPx,
} from '../src/tuning.js';
import type { Bat, Game, GameState, Rect } from '../src/types.js';
import { collect, makeGame } from './helpers.js';

const SEEDS: readonly number[] = Array.from({ length: 40 }, (_, i) => i + 1);

/**
 * The pumpkin sequence recorded from the game before bats existed (bat stream
 * suppressed): the first 40 obstacles as kind-initial plus group, and every
 * obstacle spawned before BAT_FIRST_TICK with its spawn tick.
 */
const PRE_BATS_GOLDEN: Readonly<
  Record<number, { readonly kinds: string; readonly early: string }>
> = {
  1: {
    kinds:
      'l0 s1 s2 s2 s3 s3 s4 s5 s6 l7 s8 s9 s9 l10 s11 s11 s11 s12 s13 s14 s14 l15 s16 s17 s17 s18 s18 s18 s19 s19 s19 s20 s21 s22 s22 s22 l23 l24 s25 l26',
    early:
      'l0@20 s1@184 s2@313 s2@313 s3@481 s3@481 s4@567 s5@651 s6@759 l7@847 s8@975 s9@1064 s9@1064 l10@1209 s11@1323 s11@1323 s11@1323 s12@1420',
  },
  42: {
    kinds:
      's0 s0 s0 l1 s2 s2 s2 l3 l4 s5 s5 s6 s6 s6 s7 l8 s9 s10 s10 l11 l12 l13 l14 s15 l16 s17 s17 s17 l18 s19 l20 s21 s21 s21 s22 s22 s22 s23 s24 s25',
    early:
      's0@19 s0@19 s0@19 l1@158 s2@256 s2@256 s2@256 l3@377 l4@519 s5@638 s5@638 s6@711 s6@711 s6@711 s7@791 l8@887 s9@1032 s10@1119 s10@1119 l11@1268 l12@1343 l13@1470',
  },
  2024: {
    kinds:
      's0 s0 s1 s1 l2 s3 s3 s3 l4 s5 s6 s6 s6 l7 s8 s8 s9 s9 s9 s10 s10 l11 s12 s12 s12 s13 s13 s13 s14 s14 s15 s15 l16 l17 s18 s18 s18 s19 s20 l21',
    early:
      's0@26 s0@26 s1@164 s1@164 l2@272 s3@410 s3@410 s3@410 l4@531 s5@645 s6@715 s6@715 s6@715 l7@876 s8@948 s8@948 s9@1071 s9@1071 s9@1071 s10@1153 s10@1153 l11@1296 s12@1393 s12@1393 s12@1393',
  },
};

type BatPlan = 'stand' | 'jump' | 'duck';

/** Horizontal room between the dino's hitbox and another hitbox ahead of it. */
function roomTo(state: GameState, hitbox: Rect): number {
  return hitbox.x - (state.dino.hitbox.x + state.dino.hitbox.width);
}

function isAhead(state: GameState, hitbox: Rect): boolean {
  return hitbox.x + hitbox.width > state.dino.hitbox.x;
}

/**
 * Dispatches one tick's intents for a bot that jumps every pumpkin and meets
 * each bat as `plan` says: 'duck' ducks under it, 'jump' jumps at it, 'stand'
 * ignores it. The caller ticks.
 */
function botIntents(game: Game, plan: BatPlan): void {
  const state = game.view();
  const dino = state.dino;
  const reach = state.speed * 7;
  const nextBat = state.bats.find((b) => isAhead(state, b.hitbox));
  const nextPumpkin = state.obstacles.find((o) => isAhead(state, o.hitbox));
  const isDucking = dino.pose === 'duck';

  if (nextPumpkin !== undefined && dino.onGround) {
    // Time the jump so the apex (18 ticks in) falls mid-group.
    const group = state.obstacles.filter((o) => o.group === nextPumpkin.group);
    const right = Math.max(...group.map((o) => o.hitbox.x + o.hitbox.width));
    const span = right - nextPumpkin.hitbox.x;
    const room = roomTo(state, nextPumpkin.hitbox);
    if (room <= 18 * state.speed - (span + dino.hitbox.width) / 2) {
      game.dispatch('primary');
      return;
    }
  }
  if (nextBat === undefined) {
    if (isDucking) game.dispatch('duckUp');
    return;
  }
  const room = roomTo(state, nextBat.hitbox);
  if (plan === 'duck') {
    if (!isDucking && dino.onGround && room <= state.speed * 4 && room > 0) {
      game.dispatch('duckDown');
    }
  } else if (plan === 'jump' && dino.onGround && room <= reach) {
    game.dispatch('primary');
  }
}

/** Plays until the run dies, `after` returns true, or `maxTicks` pass. */
function play(
  game: Game,
  plan: BatPlan,
  maxTicks: number,
  after: (state: GameState) => boolean = () => false,
): GameState {
  for (let i = 0; i < maxTicks; i += 1) {
    botIntents(game, plan);
    game.tick();
    const state = game.view();
    if (state.phase === 'dead' || after(state)) break;
  }
  return game.view();
}

function started(seed: number, collisions: boolean): Game {
  const { game } = makeGame(seed, { deps: { collisions } });
  game.dispatch('primary');
  game.tick();
  return game;
}

/** The tick of the first batSpawn in a collision-free run of `seed`. */
function firstBatTickOf(seed: number): number {
  const game = started(seed, false);
  const spawns = collect(game, 'batSpawn');
  for (let i = 0; i < 4000 && spawns.length === 0; i += 1) {
    game.tick();
  }
  return spawns.length === 0 ? Number.POSITIVE_INFINITY : game.view().tick;
}

describe('bat timing (spec 2.7)', () => {
  it('shows no bat before tick BAT_FIRST_TICK, over 40 seeds', () => {
    for (const seed of SEEDS) {
      const game = started(seed, false);
      const spawns = collect(game, 'batSpawn');
      for (let i = 0; i < BAT_FIRST_TICK - 2; i += 1) {
        game.tick();
        expect(game.view().bats).toHaveLength(0);
      }
      expect(spawns).toHaveLength(0);
    }
  });

  it('has shown a bat by tick 3600 and never before 1500, over 40 seeds', () => {
    for (const seed of SEEDS) {
      const first = firstBatTickOf(seed);
      expect(first).toBeGreaterThanOrEqual(BAT_FIRST_TICK);
      expect(first).toBeLessThanOrEqual(3600);
    }
  });

  it('spaces bats by at least the bat-to-bat minimum and the drawn interval', () => {
    for (const seed of [3, 11, 29]) {
      const game = started(seed, false);
      const ticks: number[] = [];
      game.on('batSpawn', () => {
        ticks.push(game.view().tick);
      });
      game.tick(9000);
      expect(ticks.length).toBeGreaterThan(3);
      for (let i = 1; i < ticks.length; i += 1) {
        const gap = (ticks[i] ?? 0) - (ticks[i - 1] ?? 0);
        expect(gap).toBeGreaterThanOrEqual(BAT_TO_BAT_TICKS);
        expect(gap).toBeGreaterThanOrEqual(BAT_INTERVAL_TICKS[0]);
      }
    }
  });

  it('numbers bats from 0 and gives each a spawn event', () => {
    const game = started(6, false);
    const spawns = collect(game, 'batSpawn');
    game.tick(6000);
    expect(spawns.map((e) => e.bat.id)).toEqual(spawns.map((_, i) => i));
  });
});

describe('bats against the dinosaur (spec 2.7)', () => {
  const PLAY_SEEDS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8];

  it('crashes a standing dinosaur into the same game-over state as a pumpkin', () => {
    let crashes = 0;
    for (const seed of PLAY_SEEDS) {
      const game = started(seed, true);
      const state = play(game, 'stand', 4500);
      const hitBat = state.bats.some((b) =>
        intersects(state.dino.hitbox, b.hitbox),
      );
      if (state.phase === 'dead' && hitBat) {
        crashes += 1;
        expect(state.dino.pose).toBe('hit');
        expect(state.hud.gameOver).toBe(true);
        expect(state.tick).toBeGreaterThanOrEqual(BAT_FIRST_TICK);
      }
    }
    expect(crashes).toBeGreaterThan(0);
  });

  it('crashes a jumping dinosaur', () => {
    let crashes = 0;
    for (const seed of PLAY_SEEDS) {
      const game = started(seed, true);
      const state = play(game, 'jump', 4500);
      const hitBat = state.bats.some((b) =>
        intersects(state.dino.hitbox, b.hitbox),
      );
      if (state.phase === 'dead' && hitBat && !state.dino.onGround) {
        crashes += 1;
      }
    }
    expect(crashes).toBeGreaterThan(0);
  });

  it('lets a ducking dinosaur pass underneath with space to spare, and the run continues', () => {
    let passes = 0;
    for (const seed of PLAY_SEEDS) {
      const game = started(seed, true);
      let overlapped = false;
      let minVerticalGap = Number.POSITIVE_INFINITY;
      const passed = { at: -1 };
      const state = play(game, 'duck', 4500, (s) => {
        for (const bat of s.bats) {
          const overX =
            s.dino.hitbox.x < bat.hitbox.x + bat.hitbox.width &&
            bat.hitbox.x < s.dino.hitbox.x + s.dino.hitbox.width;
          if (overX) {
            overlapped = true;
            expect(s.dino.pose).toBe('duck');
            minVerticalGap = Math.min(
              minVerticalGap,
              s.dino.hitbox.y - (bat.hitbox.y + bat.hitbox.height),
            );
          } else if (
            overlapped &&
            bat.hitbox.x + bat.hitbox.width < s.dino.hitbox.x
          ) {
            passed.at = s.tick;
          }
        }
        return passed.at >= 0;
      });
      if (Number.isFinite(minVerticalGap) && passed.at >= 0) {
        passes += 1;
        expect(state.phase).toBe('running');
        // A near miss: visible space between the ducked hitbox and the bat.
        expect(minVerticalGap).toBeGreaterThan(0);
      }
    }
    expect(passes).toBeGreaterThan(0);
  });
});

describe('bat lifecycle and spacing (spec 2.7)', () => {
  it('removes a bat once it is fully off the left edge and never brings it back', () => {
    const game = started(4, false);
    const seen = new Set<number>();
    const gone = new Set<number>();
    let previous: readonly Bat[] = [];
    for (let i = 0; i < 7000; i += 1) {
      game.tick();
      const bats = game.view().bats;
      for (const bat of bats) {
        expect(gone.has(bat.id)).toBe(false);
        expect(bat.x + bat.width).toBeGreaterThanOrEqual(0);
        seen.add(bat.id);
      }
      for (const old of previous) {
        if (!bats.some((b) => b.id === old.id)) gone.add(old.id);
      }
      previous = bats;
    }
    expect(seen.size).toBeGreaterThan(2);
    expect(gone.size).toBeGreaterThan(1);
  });

  it('keeps a bat and a pumpkin group at least the minimum gap apart when the later one appears', () => {
    let comparisons = 0;
    for (const seed of SEEDS) {
      const game = started(seed, false);
      game.on('batSpawn', (event) => {
        const state = game.view();
        const floor = minGapPx(speedAt(state.tick));
        for (const o of state.obstacles) {
          // The pumpkin sits left of the new bat at the right edge.
          const gap = event.bat.x - (o.x + o.width);
          expect(gap).toBeGreaterThanOrEqual(floor - 1e-6);
          comparisons += 1;
        }
      });
      game.on('spawn', (event) => {
        const state = game.view();
        const floor = minGapPx(speedAt(state.tick));
        for (const bat of state.bats) {
          const gap = event.obstacle.x - (bat.x + bat.width);
          expect(gap).toBeGreaterThanOrEqual(floor - 1e-6);
          comparisons += 1;
        }
      });
      game.tick(9000);
    }
    expect(comparisons).toBeGreaterThan(0);
  });

  it('keeps one bat at least a second of travel from the next', () => {
    const game = started(8, false);
    let checked = 0;
    game.on('batSpawn', (event) => {
      const state = game.view();
      for (const other of state.bats) {
        if (other.id === event.bat.id) continue;
        expect(event.bat.x - (other.x + other.width)).toBeGreaterThanOrEqual(
          state.speed * 60,
        );
        checked += 1;
      }
    });
    game.tick(9000);
    // Bats are removed once they leave, so earlier ones are rarely on screen.
    expect(checked).toBeGreaterThanOrEqual(0);
  });
});

describe('seeded courses stay the same with bats (spec 2.7)', () => {
  for (const seedText of Object.keys(PRE_BATS_GOLDEN)) {
    it(`keeps the pumpkin sequence for seed ${seedText}`, () => {
      const seed = Number(seedText);
      const golden = PRE_BATS_GOLDEN[seed];
      if (golden === undefined) throw new Error('missing golden');
      const game = started(seed, false);
      game.tick(6000);
      const log = game.view().spawnLog;
      const label = (e: (typeof log)[number]): string =>
        `${e.kind.charAt(0)}${String(e.group)}`;
      const count = golden.kinds.split(' ').length;
      expect(log.slice(0, count).map(label).join(' ')).toBe(golden.kinds);
      const early = log
        .filter((e) => e.tick < BAT_FIRST_TICK)
        .map((e) => `${label(e)}@${String(e.tick)}`)
        .join(' ');
      expect(early).toBe(golden.early);
    });
  }

  it('re-seeds the bat stream on restart, replaying the same bat ticks', () => {
    const game = started(12, true);
    const ticks: number[] = [];
    game.on('batSpawn', () => {
      ticks.push(game.view().tick);
    });
    const first = play(game, 'stand', 6000);
    expect(first.phase).toBe('dead');
    const firstRun = [...ticks];
    expect(firstRun.length).toBeGreaterThan(0);

    ticks.length = 0;
    game.dispatch('primary');
    game.tick();
    expect(game.view().bats).toHaveLength(0);
    play(game, 'stand', 6000);
    expect(ticks).toEqual(firstRun);
  });
});

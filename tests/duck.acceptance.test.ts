// Acceptance tests for spec 002-halloween-edition section 2.6 (ducking),
// driving createGame through dispatch and tick (technical considerations 2.4).
// @spec: 002-halloween-edition

import { describe, expect, it } from 'vitest';
import { Sprites } from '../src/sprites.js';
import { GROUND_Y, JUMP_DURATION_TICKS } from '../src/tuning.js';
import type { Game, GameEvent } from '../src/types.js';
import { collect, makeGame, runUntil } from './helpers.js';

const ALL_EVENTS: readonly GameEvent['type'][] = [
  'start',
  'restart',
  'tick',
  'jump',
  'land',
  'duckStart',
  'duckEnd',
  'die',
];

/** A running game with collisions off, seeded, with the start step done. */
function runningGame(collisions = false): Game {
  const { game } = makeGame(7, { deps: { collisions } });
  game.dispatch('primary');
  game.tick();
  return game;
}

/** Records every event type in emission order. */
function recordOrder(game: Game): GameEvent['type'][] {
  const order: GameEvent['type'][] = [];
  for (const type of ALL_EVENTS) {
    game.on(type, () => {
      order.push(type);
    });
  }
  return order;
}

describe('ducking (spec 2.6)', () => {
  it('lowers into a shorter pose while held and stands when released', () => {
    const game = runningGame();
    const standing = game.state().dino;
    const starts = collect(game, 'duckStart');
    const ends = collect(game, 'duckEnd');

    game.dispatch('duckDown');
    game.tick();
    const ducked = game.state().dino;
    expect(ducked.pose).toBe('duck');
    expect(starts).toHaveLength(1);
    expect(ducked.height).toBeLessThan(standing.height);
    expect(ducked.hitbox.height).toBe(Sprites.dinoDuck0.hitbox.height);
    expect(ducked.hitbox.height).toBe(24);
    // The bottom stays on the ground line.
    expect(ducked.y + ducked.height).toBe(GROUND_Y);

    // Held: no key repeat reaches the game, and the pose persists.
    game.tick(30);
    expect(game.state().dino.pose).toBe('duck');
    expect(starts).toHaveLength(1);

    game.dispatch('duckUp');
    game.tick();
    expect(game.state().dino.pose).toBe('run');
    expect(game.state().dino.hitbox.height).toBe(standing.hitbox.height);
    expect(ends).toHaveLength(1);
  });

  it('alternates the duck run frames', () => {
    const game = runningGame();
    game.dispatch('duckDown');
    game.tick();
    const frames = new Set<number>();
    for (let i = 0; i < 24; i += 1) {
      game.tick();
      frames.add(game.state().dino.frame);
    }
    expect(frames.size).toBe(2);
  });

  it('jumps from a duck as usual and lands standing', () => {
    const game = runningGame();
    game.dispatch('duckDown');
    game.tick();
    const order = recordOrder(game);
    game.dispatch('primary');
    game.tick();
    expect(order).toEqual(['duckEnd', 'jump', 'tick']);
    expect(game.state().dino.onGround).toBe(false);
    expect(game.state().dino.pose).not.toBe('duck');
    game.tick(JUMP_DURATION_TICKS - 1);
    expect(game.state().dino.onGround).toBe(true);
    expect(game.state().dino.pose).toBe('run');
  });

  it('does not delay a jump: duck intents bypass the primary queue', () => {
    const game = runningGame();
    game.dispatch('primary');
    game.dispatch('duckDown');
    game.tick();
    // Both land in the same step: the duck change first, then the jump.
    expect(game.state().dino.onGround).toBe(false);
    expect(game.state().dino.pose).not.toBe('duck');
  });

  it('keeps only the last duck intent dispatched before a step', () => {
    const game = runningGame();
    const starts = collect(game, 'duckStart');
    game.dispatch('duckDown');
    game.dispatch('duckUp');
    game.tick();
    expect(starts).toHaveLength(0);
    expect(game.state().dino.pose).toBe('run');
  });

  it('ignores duckDown in the air and lands standing', () => {
    const game = runningGame();
    const starts = collect(game, 'duckStart');
    game.dispatch('primary');
    game.tick(5);
    game.dispatch('duckDown');
    game.tick(JUMP_DURATION_TICKS);
    const dino = game.state().dino;
    expect(dino.onGround).toBe(true);
    expect(dino.pose).toBe('run');
    expect(starts).toHaveLength(0);
  });

  it('lands standing when the key is held across the landing', () => {
    const game = runningGame();
    const starts = collect(game, 'duckStart');
    game.dispatch('duckDown');
    game.tick();
    game.dispatch('primary');
    game.tick(JUMP_DURATION_TICKS + 2);
    expect(game.state().dino.onGround).toBe(true);
    expect(game.state().dino.pose).toBe('run');
    // Only the first press started a duck; the held key makes no new one.
    expect(starts).toHaveLength(1);
    // A fresh press ducks again.
    game.dispatch('duckDown');
    game.tick();
    expect(game.state().dino.pose).toBe('duck');
  });

  it('does nothing on the start screen', () => {
    const { game } = makeGame(7);
    const starts = collect(game, 'duckStart');
    game.dispatch('duckDown');
    game.tick(3);
    expect(game.state().phase).toBe('idle');
    expect(game.state().dino.pose).toBe('stand');
    expect(starts).toHaveLength(0);
    // The ignored press does not linger: the run that starts is standing.
    game.dispatch('primary');
    game.tick(2);
    expect(game.state().dino.pose).toBe('run');
  });

  it('does nothing on the game-over screen, and a restart is standing', () => {
    const { game } = makeGame(7);
    game.dispatch('primary');
    game.tick();
    game.dispatch('duckDown');
    runUntil(game, (s) => s.phase === 'dead', 600);
    const starts = collect(game, 'duckStart');
    const ends = collect(game, 'duckEnd');
    game.dispatch('duckDown');
    game.dispatch('duckUp');
    game.tick(3);
    expect(game.state().phase).toBe('dead');
    expect(game.state().dino.pose).toBe('hit');
    expect(starts).toHaveLength(0);
    expect(ends).toHaveLength(0);

    game.dispatch('primary');
    game.tick();
    expect(game.state().phase).toBe('running');
    expect(game.state().dino.pose).toBe('run');
    expect(game.state().dino.hitbox.height).toBe(
      Sprites.dinoStand.hitbox.height,
    );
  });
});

import { describe, expect, it } from 'vitest';
import { hasCollision, intersects } from '../src/collision.js';
import { Sprites } from '../src/sprites.js';
import { DINO_X, GROUND_Y } from '../src/tuning.js';
import type { Dino, Obstacle, Rect } from '../src/types.js';

// Sprite geometry from src/sprites.ts, so the fixtures follow the real sprites:
// sizes and hitboxes relative to the sprite's top-left corner.
const DINO_SIZE = {
  width: Sprites.dinoStand.width,
  height: Sprites.dinoStand.height,
} as const;
const DINO_HITBOX: Rect = Sprites.dinoStand.hitbox;
const CACTUS_SMALL_SIZE = {
  width: Sprites.cactusSmall.width,
  height: Sprites.cactusSmall.height,
} as const;
const CACTUS_SMALL_HITBOX: Rect = Sprites.cactusSmall.hitbox;

function offset(box: Rect, x: number, y: number): Rect {
  return { x: x + box.x, y: y + box.y, width: box.width, height: box.height };
}

/** The standing dino on the ground at its fixed column. */
function groundDino(): Dino {
  const x = DINO_X;
  const y = GROUND_Y - DINO_SIZE.height;
  return {
    x,
    y,
    ...DINO_SIZE,
    onGround: true,
    pose: 'run',
    frame: 0,
    hitbox: offset(DINO_HITBOX, x, y),
  };
}

/** A small cactus on the ground with its left edge at `x`. */
function smallCactus(x: number, id = 0): Obstacle {
  const y = GROUND_Y - CACTUS_SMALL_SIZE.height;
  return {
    x,
    y,
    ...CACTUS_SMALL_SIZE,
    id,
    group: id,
    kind: 'small',
    hitbox: offset(CACTUS_SMALL_HITBOX, x, y),
  };
}

describe('intersects', () => {
  const a: Rect = { x: 10, y: 10, width: 20, height: 20 };

  it('is true for partially overlapping rectangles, in either order', () => {
    const b: Rect = { x: 25, y: 25, width: 20, height: 20 };
    expect(intersects(a, b)).toBe(true);
    expect(intersects(b, a)).toBe(true);
  });

  it('is false when separated on the x axis only', () => {
    expect(intersects(a, { x: 40, y: 10, width: 5, height: 20 })).toBe(false);
    expect(intersects(a, { x: 0, y: 10, width: 5, height: 20 })).toBe(false);
  });

  it('is false when separated on the y axis only', () => {
    expect(intersects(a, { x: 10, y: 40, width: 20, height: 5 })).toBe(false);
    expect(intersects(a, { x: 10, y: 0, width: 20, height: 5 })).toBe(false);
  });

  it('is false for rectangles that only touch along an edge (strict overlap)', () => {
    expect(intersects(a, { x: 30, y: 10, width: 5, height: 20 })).toBe(false);
    expect(intersects(a, { x: 5, y: 10, width: 5, height: 20 })).toBe(false);
    expect(intersects(a, { x: 10, y: 30, width: 20, height: 5 })).toBe(false);
    expect(intersects(a, { x: 10, y: 5, width: 20, height: 5 })).toBe(false);
    expect(intersects(a, { x: 30, y: 30, width: 5, height: 5 })).toBe(false);
  });

  it('is true when one rectangle contains the other', () => {
    const inner: Rect = { x: 15, y: 15, width: 5, height: 5 };
    expect(intersects(a, inner)).toBe(true);
    expect(intersects(inner, a)).toBe(true);
    expect(intersects(a, a)).toBe(true);
  });
});

describe('hasCollision', () => {
  it('is false for an empty obstacle list', () => {
    expect(hasCollision(groundDino(), [])).toBe(false);
  });

  it('is true when the hitboxes overlap', () => {
    const dino = groundDino();
    const cactus = smallCactus(DINO_X + 20);
    expect(intersects(dino.hitbox, cactus.hitbox)).toBe(true);
    expect(hasCollision(dino, [cactus])).toBe(true);
  });

  it('is true when any one obstacle of several hits', () => {
    const dino = groundDino();
    const obstacles = [
      smallCactus(DINO_X + 300, 0),
      smallCactus(DINO_X + 20, 1),
    ];
    expect(hasCollision(dino, obstacles)).toBe(true);
  });

  it('is false for a near miss: sprite boxes overlap but the hitboxes do not (spec 2.5)', () => {
    const dino = groundDino();
    // Leading edge of the cactus hitbox flush with the dino hitbox's right edge.
    const x = dino.hitbox.x + dino.hitbox.width - CACTUS_SMALL_HITBOX.x;
    const cactus = smallCactus(x);

    // The drawn sprites overlap, so a check on sprite boxes would call it a crash...
    expect(intersects(dino, cactus)).toBe(true);
    // ...but there is daylight between the bodies, so the run goes on.
    expect(intersects(dino.hitbox, cactus.hitbox)).toBe(false);
    expect(hasCollision(dino, [cactus])).toBe(false);
  });

  it('is false when the dino is airborne above a cactus', () => {
    const ground = groundDino();
    const lift = 60;
    const dino: Dino = {
      ...ground,
      y: ground.y - lift,
      onGround: false,
      hitbox: { ...ground.hitbox, y: ground.hitbox.y - lift },
    };
    expect(hasCollision(dino, [smallCactus(DINO_X + 20)])).toBe(false);
  });
});

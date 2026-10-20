// Pure sprite data: hand-drawn ASCII bitmaps, one character per logical pixel
// ('#' is a pixel, '.' is empty), with an inset hitbox and the horizontal pixel
// runs render.ts fills. Width, height and runs derive from the bitmap once, at
// module load. Later slices add sprites to `Sprites` through `makeSprite`.

import { assertNever } from './assert.js';
import type { ObstacleKind, Rect } from './types.js';

export interface Sprite {
  readonly bitmap: readonly string[];
  readonly width: number;
  readonly height: number;
  /** Collision box, relative to the sprite's top-left corner. */
  readonly hitbox: Rect;
  /** Horizontal runs of '#' per row, relative to the sprite's top-left corner, each 1 px high. */
  readonly runs: readonly Rect[];
}

const PIXEL = '#';
const EMPTY = '.';

/** The horizontal runs of '#' in each row of a bitmap, left to right, top to bottom. */
export function computeRuns(bitmap: readonly string[]): readonly Rect[] {
  const runs: Rect[] = [];
  bitmap.forEach((row, y) => {
    let start = -1;
    for (let x = 0; x <= row.length; x += 1) {
      const isPixel = x < row.length && row[x] === PIXEL;
      if (isPixel && start < 0) {
        start = x;
      } else if (!isPixel && start >= 0) {
        runs.push({ x: start, y, width: x - start, height: 1 });
        start = -1;
      }
    }
  });
  return runs;
}

/**
 * Builds a sprite from its bitmap and hitbox. Throws on a malformed bitmap
 * (empty, ragged rows, characters other than '#' and '.') or a hitbox outside it.
 */
export function makeSprite(bitmap: readonly string[], hitbox: Rect): Sprite {
  const width = bitmap[0]?.length ?? 0;
  const height = bitmap.length;
  if (width === 0) {
    throw new Error('Sprite bitmap must have at least one non-empty row');
  }
  bitmap.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(
        `Sprite bitmap row ${String(y)} has length ${String(row.length)}, expected ${String(width)}`,
      );
    }
    for (const ch of row) {
      if (ch !== PIXEL && ch !== EMPTY) {
        throw new Error(
          `Sprite bitmap row ${String(y)} contains '${ch}'; use '${PIXEL}' or '${EMPTY}'`,
        );
      }
    }
  });
  if (
    hitbox.x < 0 ||
    hitbox.y < 0 ||
    hitbox.width <= 0 ||
    hitbox.height <= 0 ||
    hitbox.x + hitbox.width > width ||
    hitbox.y + hitbox.height > height
  ) {
    throw new Error(
      'Sprite hitbox must be non-empty and lie inside the bitmap',
    );
  }
  return {
    bitmap: Object.freeze([...bitmap]),
    width,
    height,
    hitbox: Object.freeze({ ...hitbox }),
    runs: Object.freeze(computeRuns(bitmap)),
  };
}

// 44 by 47, the standing T-rex of the original, facing right: head with an
// eye gap, open jaw, small arm, tail on the left, two legs.
const DINO_STAND = [
  '........................##################..',
  '........................##################..',
  '......................####..################',
  '......................####..################',
  '......................######################',
  '......................######################',
  '......................######################',
  '......................######################',
  '......................######################',
  '......................######################',
  '......................############..........',
  '......................############..........',
  '......................##################....',
  '......................##################....',
  '##..................############............',
  '##..................############............',
  '##................##############............',
  '##................##############............',
  '####............######################......',
  '####............######################......',
  '######........##################....##......',
  '######........##################....##......',
  '########....####################............',
  '########....####################............',
  '################################............',
  '################################............',
  '..##############################............',
  '..##############################............',
  '....############################............',
  '....############################............',
  '......########################..............',
  '......########################..............',
  '........####################................',
  '........####################................',
  '..........################..................',
  '..........################..................',
  '............######....####..................',
  '............######....####..................',
  '............####........##..................',
  '............####........##..................',
  '............##..........##..................',
  '............##..........##..................',
  '............####........####................',
  '............####........####................',
  '............####........####................',
  '............####........####................',
  '............####........####................',
] as const;

// Rows 0 to 35 (head, body, arm, tail, hips) are shared by the stand and run
// poses; only the legs below differ, so the run cycle never moves the hitbox.
const DINO_BODY = DINO_STAND.slice(0, 36);

// Run frame 0: the back leg kicks up behind, the front leg carries the weight.
const DINO_RUN_0 = [
  ...DINO_BODY,
  '............######....####..................',
  '............######....####..................',
  '..........####..........##..................',
  '..........####..........##..................',
  '........................##..................',
  '........................##..................',
  '........................####................',
  '........................####................',
  '........................####................',
  '........................####................',
  '........................####................',
];

// Run frame 1: the front leg lifts forward, the back leg carries the weight.
const DINO_RUN_1 = [
  ...DINO_BODY,
  '............######....####..................',
  '............######....####..................',
  '............####........######..............',
  '............####........######..............',
  '............##..............................',
  '............##..............................',
  '............####............................',
  '............####............................',
  '............####............................',
  '............####............................',
  '............####............................',
];

// The hit pose (functional spec 2.5): the standing dino with an X for an eye,
// a 3 by 3 X of light pixels drawn at double size in rows 2 to 7, where the
// standing eye is a 2 by 2 gap. Same size and hitbox as the other poses.
const DINO_HIT = [
  '........................##################..',
  '........................##################..',
  '......................####..##..############',
  '......................####..##..############',
  '......................######..##############',
  '......................######..##############',
  '......................####..##..############',
  '......................####..##..############',
  ...DINO_STAND.slice(8),
];

// Excludes the tail (x < 12), the head overhang (x >= 34) and the feet's last
// rows. Shared by all dino frames so collision does not change between them.
const DINO_HITBOX = { x: 12, y: 2, width: 22, height: 43 } as const;

// 17 by 35, the small cactus of the original: a trunk with a rounded top and
// one arm on each side, the left lower than the right.
const CACTUS_SMALL = [
  '.......###.......',
  '......#####......',
  '......#####......',
  '......#####......',
  '......#####......',
  '......#####......',
  '......#####....#.',
  '......#####...###',
  '......#####...###',
  '.#....#####...###',
  '###...#####...###',
  '###...#####...###',
  '###...#####...###',
  '###...#####...###',
  '###...#####...###',
  '###...###########',
  '###...###########',
  '###...###########',
  '###...#####......',
  '###########......',
  '###########......',
  '###########......',
  '......#####......',
  '......#####......',
  '......#####......',
  '......#####......',
  '......#####......',
  '......#####......',
  '......#####......',
  '......#####......',
  '......#####......',
  '......#####......',
  '......#####......',
  '......#####......',
  '......#####......',
] as const;

// 25 by 50, the large cactus: a wider trunk with two longer arms.
const CACTUS_LARGE = [
  '..........#####..........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######......##.',
  '.........#######.....####',
  '.........#######.....####',
  '.........#######.....####',
  '.##......#######.....####',
  '####.....#######.....####',
  '####.....#######.....####',
  '####.....#######.....####',
  '####.....#######.....####',
  '####.....#######.....####',
  '####.....#######.....####',
  '####.....#######.....####',
  '####.....#######.....####',
  '####.....#######.....####',
  '####.....#######.....####',
  '####.....################',
  '####.....################',
  '####.....################',
  '####.....################',
  '################.........',
  '################.........',
  '################.........',
  '################.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
  '.........#######.........',
] as const;

// Cactus hitboxes keep the trunk and the inner part of each arm but drop the
// outer columns, so grazing an arm tip is a near miss (functional spec 2.5).
const CACTUS_SMALL_HITBOX = { x: 2, y: 0, width: 13, height: 35 } as const;
const CACTUS_LARGE_HITBOX = { x: 3, y: 0, width: 19, height: 50 } as const;

// 64 by 4: the ground line plus a few speckles; tiles seamlessly.
const GROUND = [
  '################################################################',
  '................................................................',
  '....##..........#..............###.........#............##......',
  '..........#.........##..................#.........###...........',
] as const;

export const Sprites = Object.freeze({
  dinoStand: makeSprite(DINO_STAND, DINO_HITBOX),
  dinoRun0: makeSprite(DINO_RUN_0, DINO_HITBOX),
  dinoRun1: makeSprite(DINO_RUN_1, DINO_HITBOX),
  dinoHit: makeSprite(DINO_HIT, DINO_HITBOX),
  cactusSmall: makeSprite(CACTUS_SMALL, CACTUS_SMALL_HITBOX),
  cactusLarge: makeSprite(CACTUS_LARGE, CACTUS_LARGE_HITBOX),
  // Decorative; nothing collides with the ground.
  ground: makeSprite(GROUND, { x: 0, y: 0, width: 64, height: 4 }),
});

/**
 * The sprite for an obstacle kind. Gameplay sizes obstacles and their hitboxes
 * from it, and the renderer draws it, so both always agree.
 */
export function obstacleSprite(kind: ObstacleKind): Sprite {
  switch (kind) {
    case 'small':
      return Sprites.cactusSmall;
    case 'large':
      return Sprites.cactusLarge;
    default:
      return assertNever(kind);
  }
}

// Pure sprite data: hand-drawn ASCII bitmaps, one character per logical pixel
// ('#' is a pixel, 'o' a glowing pixel, '.' is empty), with an inset hitbox and
// the horizontal pixel runs render.ts fills. Width, height and runs derive from the bitmap once, at
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
  /** Horizontal runs of 'o' (glow) per row, relative to the top-left corner; empty without 'o'. */
  readonly glowRuns: readonly Rect[];
}

const PIXEL = '#';
const GLOW = 'o';
const EMPTY = '.';

/** The horizontal runs of `mark` (default '#') in each row of a bitmap, left to right, top to bottom. */
export function computeRuns(
  bitmap: readonly string[],
  mark: string = PIXEL,
): readonly Rect[] {
  const runs: Rect[] = [];
  bitmap.forEach((row, y) => {
    let start = -1;
    for (let x = 0; x <= row.length; x += 1) {
      const isPixel = x < row.length && row[x] === mark;
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
 * (empty, ragged rows, characters other than '#', 'o' and '.') or a hitbox outside it.
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
      if (ch !== PIXEL && ch !== GLOW && ch !== EMPTY) {
        throw new Error(
          `Sprite bitmap row ${String(y)} contains '${ch}'; use '${PIXEL}', '${GLOW}' or '${EMPTY}'`,
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
    glowRuns: Object.freeze(computeRuns(bitmap, GLOW)),
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

// 17 by 35: two round pumpkins stacked, a short stem and curl on top, each with
// vertical ridges. 'o' marks the carved faces (eyes and mouth), which render.ts
// paints as a glow.
const PUMPKIN_SMALL = [
  '..........##.....',
  '.......####......',
  '........###......',
  '....#########....',
  '..#############..',
  '.###############.',
  '#####.#####.#####',
  '####o.#####.o####',
  '###ooo#####ooo###',
  '#####.#####.#####',
  '#####.#####.#####',
  '###o#o#o#o#o#o###',
  '###ooooooooooo###',
  '#####o#o#o#o#####',
  '#####.#####.#####',
  '#####.#####.#####',
  '.###############.',
  '..#############..',
  '....#########....',
  '....#########....',
  '..#############..',
  '.###############.',
  '#####.#####.#####',
  '####o.#####.o####',
  '###ooo#####ooo###',
  '#####.#####.#####',
  '#####.#####.#####',
  '###o#o#o#o#o#o###',
  '###ooooooooooo###',
  '#####o#o#o#o#####',
  '#####.#####.#####',
  '#####.#####.#####',
  '.###############.',
  '..#############..',
  '....#########....',
] as const;

// 25 by 50, the large stack: two bigger pumpkins, the same carving.
const PUMPKIN_LARGE = [
  '............###.#........',
  '...........####..........',
  '.......###########.......',
  '....#################....',
  '..#####################..',
  '.#######################.',
  '######.#####.#####.######',
  '######oo#########oo######',
  '#####oooo#######oooo#####',
  '####oooooo#####oooooo####',
  '######.#####.#####.######',
  '######.#####.#####.######',
  '######.#####.#####.######',
  '######.#####.#####.######',
  '####o#o#o#o#o#o#o#o#o####',
  '####ooooooooooooooooo####',
  '####ooooooooooooooooo####',
  '#####o#o#o#o#o#o#o#o#####',
  '######.#####.#####.######',
  '######.#####.#####.######',
  '######.#####.#####.######',
  '######.#####.#####.######',
  '.#######################.',
  '..#####################..',
  '....#################....',
  '.......###########.......',
  '.......###########.......',
  '....#################....',
  '..#####################..',
  '.#######################.',
  '######.#####.#####.######',
  '######oo#########oo######',
  '#####oooo#######oooo#####',
  '####oooooo#####oooooo####',
  '######.#####.#####.######',
  '######.#####.#####.######',
  '######.#####.#####.######',
  '######.#####.#####.######',
  '####o#o#o#o#o#o#o#o#o####',
  '####ooooooooooooooooo####',
  '####ooooooooooooooooo####',
  '#####o#o#o#o#o#o#o#o#####',
  '######.#####.#####.######',
  '######.#####.#####.######',
  '######.#####.#####.######',
  '######.#####.#####.######',
  '.#######################.',
  '..#####################..',
  '....#################....',
  '.......###########.......',
] as const;

// Pumpkin hitboxes drop the outer columns of the round body, so grazing the
// edge is a near miss (functional spec 2.5).
const PUMPKIN_SMALL_HITBOX = { x: 2, y: 0, width: 13, height: 35 } as const;
const PUMPKIN_LARGE_HITBOX = { x: 3, y: 0, width: 19, height: 50 } as const;

// 64 by 4: the ground line plus a few speckles; tiles seamlessly.
const GROUND = [
  '################################################################',
  '................................................................',
  '....##..........#..............###.........#............##......',
  '..........#.........##..................#.........###...........',
] as const;

/** Mirrors each half-row about its right edge: 'ab' becomes 'abba'. */
function mirror(half: readonly string[]): string[] {
  return half.map((row) => row + row.split('').reverse().join(''));
}

/** Doubles every pixel in both directions, like the hand-drawn dino. */
function double(rows: readonly string[]): string[] {
  return rows.flatMap((row) => {
    const wide = row
      .split('')
      .map((ch) => ch + ch)
      .join('');
    return [wide, wide];
  });
}

// 60 by 30, the ducking dino: head forward and low, body flat, tail behind,
// legs alternating. Drawn at half size and doubled.
const DUCK_UPPER = [
  '.....................#########',
  '.....................##.######',
  '.....................#########',
  '.....................######...',
  '.........###############......',
  '.......##################.....',
  '###..#####################....',
  '.#########################....',
  '..########################....',
  '....######################....',
  '......####################....',
  '........##############........',
  '..........####....####........',
] as const;

const DINO_DUCK_0 = double([
  ...DUCK_UPPER,
  '..........####................',
  '..........######..............',
]);

const DINO_DUCK_1 = double([
  ...DUCK_UPPER,
  '..........##......####........',
  '..................######......',
]);

// Height 24 from the bottom; drops the transparent tail and nose edge columns.
const DINO_DUCK_HITBOX = { x: 6, y: 6, width: 52, height: 24 } as const;

// 44 by 52: a bat with orange eyes, wings up (0) and wings down (1).
const BAT_0 = double(
  mirror([
    '##.........',
    '###........',
    '####....#..',
    '#####...##.',
    '######..###',
    '#######o###',
    '###########',
    '###########',
    '.##########',
    '..#########',
    '...########',
    '....#######',
    '.....######',
    '......#####',
    '.......####',
    '........###',
    '........###',
    '.........##',
    '.........##',
    '.........##',
    '.........##',
    '.........##',
    '.........##',
    '.........##',
    '.........##',
    '.........#.',
  ]),
);

const BAT_1 = double(
  mirror([
    '........#..',
    '........##.',
    '........###',
    '........###',
    '.......o###',
    '.......####',
    '.....######',
    '...########',
    '..#########',
    '.##########',
    '###########',
    '###########',
    '########.##',
    '#######..##',
    '######...##',
    '#####....##',
    '#####....##',
    '####.....##',
    '####.....##',
    '###......##',
    '###......##',
    '##.......##',
    '##.......##',
    '#........##',
    '#........##',
    '#........#.',
  ]),
);

const BAT_HITBOX = { x: 3, y: 0, width: 38, height: 52 } as const;

// 24 by 26: a witch's hat, pale cone and brim with an orange band.
const HAT = double(
  mirror([
    '.....#',
    '.....#',
    '....##',
    '....##',
    '...###',
    '...###',
    '..####',
    '..oooo',
    '..oooo',
    '..####',
    '.#####',
    '######',
    '######',
  ]),
);

// 14 by 10: a wrapped candy, orange body and pale wrapper twists.
const CANDY = mirror([
  '#......',
  '##.....',
  '###.ooo',
  '.##oooo',
  '..#oooo',
  '..#oooo',
  '.##oooo',
  '###.ooo',
  '##.....',
  '#......',
]);

// 12 by 11: the HUD heart, all orange.
const HEART = mirror([
  '.ooo..',
  'oooooo',
  'oooooo',
  'oooooo',
  'oooooo',
  '.ooooo',
  '..oooo',
  '...ooo',
  '....oo',
  '.....o',
  '.....o',
]);

const fullBox = (rows: readonly string[]): Rect => ({
  x: 0,
  y: 0,
  width: rows[0]?.length ?? 0,
  height: rows.length,
});

const pumpkinSmall = makeSprite(PUMPKIN_SMALL, PUMPKIN_SMALL_HITBOX);
const pumpkinLarge = makeSprite(PUMPKIN_LARGE, PUMPKIN_LARGE_HITBOX);

export const Sprites = Object.freeze({
  dinoStand: makeSprite(DINO_STAND, DINO_HITBOX),
  dinoRun0: makeSprite(DINO_RUN_0, DINO_HITBOX),
  dinoRun1: makeSprite(DINO_RUN_1, DINO_HITBOX),
  dinoHit: makeSprite(DINO_HIT, DINO_HITBOX),
  // The cactus names are the frozen contract; the pumpkin names alias them.
  cactusSmall: pumpkinSmall,
  cactusLarge: pumpkinLarge,
  pumpkinSmall,
  pumpkinLarge,
  dinoDuck0: makeSprite(DINO_DUCK_0, DINO_DUCK_HITBOX),
  dinoDuck1: makeSprite(DINO_DUCK_1, DINO_DUCK_HITBOX),
  bat0: makeSprite(BAT_0, BAT_HITBOX),
  bat1: makeSprite(BAT_1, BAT_HITBOX),
  hat: makeSprite(HAT, fullBox(HAT)),
  candy: makeSprite(CANDY, fullBox(CANDY)),
  heart: makeSprite(HEART, fullBox(HEART)),
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

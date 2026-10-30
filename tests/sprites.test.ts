import { describe, expect, it } from 'vitest';
import {
  Sprites,
  computeRuns,
  makeSprite,
  obstacleSprite,
} from '../src/sprites.js';
import type { Sprite } from '../src/sprites.js';
import type { Rect } from '../src/types.js';

const allSprites = Object.entries(Sprites);

/** Paints runs onto a blank grid with `mark` and returns it as bitmap rows. */
function paintRuns(
  sprite: Sprite,
  runs: readonly Rect[] = sprite.runs,
  mark = '#',
): string[] {
  const grid = Array.from({ length: sprite.height }, () =>
    Array.from({ length: sprite.width }, () => '.'),
  );
  for (const run of runs) {
    const row = grid[run.y];
    if (row === undefined)
      throw new Error(`run outside sprite at y ${String(run.y)}`);
    for (let x = run.x; x < run.x + run.width; x += 1) {
      if (x >= sprite.width)
        throw new Error(`run outside sprite at x ${String(x)}`);
      if (row[x] !== '.')
        throw new Error(`runs overlap at ${String(x)},${String(run.y)}`);
      row[x] = mark;
    }
  }
  return grid.map((row) => row.join(''));
}

describe('sprites', () => {
  it.each(allSprites)('%s has equal-length rows', (_name, sprite) => {
    for (const row of sprite.bitmap) {
      expect(row).toHaveLength(sprite.width);
    }
  });

  it.each(allSprites)(
    '%s derives width and height from its bitmap',
    (_name, sprite) => {
      expect(sprite.height).toBe(sprite.bitmap.length);
      expect(sprite.width).toBe(sprite.bitmap[0]?.length);
    },
  );

  it.each(allSprites)(
    '%s runs cover exactly the # pixels and glowRuns exactly the o pixels',
    (_name, sprite) => {
      expect(sprite.runs.length + sprite.glowRuns.length).toBeGreaterThan(0);
      const solid = sprite.bitmap.map((row) => row.replaceAll('o', '.'));
      const glow = sprite.bitmap.map((row) => row.replaceAll('#', '.'));
      expect(paintRuns(sprite)).toEqual(solid);
      expect(paintRuns(sprite, sprite.glowRuns, 'o')).toEqual(glow);
      for (const run of [...sprite.runs, ...sprite.glowRuns]) {
        expect(run.height).toBe(1);
        expect(run.width).toBeGreaterThan(0);
      }
    },
  );

  it('only the pumpkins, bats, hat, candy and heart glow; every other sprite has empty glowRuns', () => {
    const glowing = ['pumpkin', 'cactus', 'bat', 'hat', 'candy', 'heart'];
    for (const [name, sprite] of allSprites) {
      if (glowing.some((prefix) => name.startsWith(prefix))) {
        expect(sprite.glowRuns.length).toBeGreaterThan(0);
      } else {
        expect(sprite.glowRuns).toEqual([]);
      }
    }
  });

  it('the pumpkin names alias the frozen cactus names', () => {
    expect(Sprites.pumpkinSmall).toBe(Sprites.cactusSmall);
    expect(Sprites.pumpkinLarge).toBe(Sprites.cactusLarge);
  });

  it.each(allSprites)('%s hitbox lies inside the sprite', (_name, sprite) => {
    const { x, y, width, height } = sprite.hitbox;
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + width).toBeLessThanOrEqual(sprite.width);
    expect(y + height).toBeLessThanOrEqual(sprite.height);
  });

  it('the standing dino is about 44 by 47 with an inset hitbox', () => {
    const dino = Sprites.dinoStand;
    expect(dino.width).toBe(44);
    expect(dino.height).toBe(47);
    // Inset on the left (tail) and on the right (head overhang).
    expect(dino.hitbox.x).toBeGreaterThan(0);
    expect(dino.hitbox.x + dino.hitbox.width).toBeLessThan(dino.width);
  });

  it.each([
    ['dinoRun0', Sprites.dinoRun0],
    ['dinoRun1', Sprites.dinoRun1],
  ] as const)(
    '%s has the standing dino size, hitbox and body',
    (_name, run) => {
      const stand = Sprites.dinoStand;
      expect(run.width).toBe(stand.width);
      expect(run.height).toBe(stand.height);
      expect(run.hitbox).toEqual(stand.hitbox);
      // Everything above the legs (rows 0 to 35) is the same body.
      expect(run.bitmap.slice(0, 36)).toEqual(stand.bitmap.slice(0, 36));
    },
  );

  it('the two run frames differ only in the legs, and each lifts a different one', () => {
    const { dinoRun0, dinoRun1, dinoStand } = Sprites;
    const legs = (sprite: Sprite): readonly string[] => sprite.bitmap.slice(36);
    expect(legs(dinoRun0)).not.toEqual(legs(dinoRun1));
    expect(legs(dinoRun0)).not.toEqual(legs(dinoStand));
    expect(legs(dinoRun1)).not.toEqual(legs(dinoStand));

    // On the bottom row the standing dino has both feet down; each run frame
    // keeps exactly one of them, and not the same one.
    const footColumns = (sprite: Sprite): number[] => {
      const bottom = sprite.bitmap[sprite.height - 1] ?? '';
      return [12, 24].filter((x) => bottom[x] === '#');
    };
    expect(footColumns(dinoStand)).toEqual([12, 24]);
    expect(footColumns(dinoRun0)).toEqual([24]);
    expect(footColumns(dinoRun1)).toEqual([12]);
  });

  it('the hit dino has the standing size, hitbox, body and legs, with an X for an eye', () => {
    const { dinoHit, dinoStand } = Sprites;
    expect(dinoHit.width).toBe(dinoStand.width);
    expect(dinoHit.height).toBe(dinoStand.height);
    expect(dinoHit.hitbox).toEqual(dinoStand.hitbox);
    // Below the head (rows 8 onward: neck, body, arm, tail, standing legs) it
    // is the standing dino.
    expect(dinoHit.bitmap.slice(8)).toEqual(dinoStand.bitmap.slice(8));

    // Functional spec 2.5: the eye (rows 2 to 7, columns 26 to 31) is an X of
    // light pixels, a 3 by 3 X drawn at double size like the rest of the dino.
    const eye = dinoHit.bitmap.slice(2, 8).map((row) => row.slice(26, 32));
    expect(eye).toEqual([
      '..##..',
      '..##..',
      '##..##',
      '##..##',
      '..##..',
      '..##..',
    ]);
    // The X is enclosed by the head: solid on both sides of it.
    for (const row of dinoHit.bitmap.slice(2, 8)) {
      expect(row.slice(22, 26)).toBe('####');
      expect(row.slice(32, 44)).toBe('#'.repeat(12));
    }
  });

  it.each([
    [
      'cactusSmall',
      Sprites.cactusSmall,
      17,
      35,
      { x: 2, y: 0, width: 13, height: 35 },
    ],
    [
      'cactusLarge',
      Sprites.cactusLarge,
      25,
      50,
      { x: 3, y: 0, width: 19, height: 50 },
    ],
  ] as const)(
    '%s is %i by %i with an unchanged hitbox',
    (_name, pumpkin, width, height, hitbox) => {
      expect(pumpkin.width).toBe(width);
      expect(pumpkin.height).toBe(height);
      expect(pumpkin.hitbox).toEqual(hitbox);
    },
  );

  it.each([
    ['cactusSmall', Sprites.cactusSmall],
    ['cactusLarge', Sprites.cactusLarge],
  ] as const)(
    '%s stands on the ground and its hitbox excludes the outer columns',
    (_name, pumpkin) => {
      const { hitbox } = pumpkin;
      // The bottom pumpkin's round base fills the last row, so it sits on the ground.
      const bottom = pumpkin.bitmap[pumpkin.height - 1] ?? '';
      expect(bottom.replaceAll('.', '').length).toBeGreaterThanOrEqual(9);
      expect(hitbox.y + hitbox.height).toBe(pumpkin.height);
      expect(hitbox.x).toBeGreaterThan(0);
      expect(hitbox.x + hitbox.width).toBeLessThan(pumpkin.width);
      // The carved face lies inside the hitbox.
      for (const run of pumpkin.glowRuns) {
        expect(run.x).toBeGreaterThanOrEqual(hitbox.x);
        expect(run.x + run.width).toBeLessThanOrEqual(hitbox.x + hitbox.width);
      }
    },
  );

  it.each([
    ['cactusSmall', Sprites.cactusSmall, 20],
    ['cactusLarge', Sprites.cactusLarge, 40],
  ] as const)(
    '%s has at least %i glow pixels so the carved faces are obvious',
    (_name, pumpkin, minimum) => {
      const glow = pumpkin.glowRuns.reduce((sum, run) => sum + run.width, 0);
      expect(glow).toBeGreaterThanOrEqual(minimum);
    },
  );

  it.each([
    ['cactusSmall', Sprites.cactusSmall],
    ['cactusLarge', Sprites.cactusLarge],
  ] as const)(
    '%s is two pumpkins stacked: a narrow waist between two wide bulges',
    (_name, pumpkin) => {
      const widths = pumpkin.bitmap.map(
        (row) => row.lastIndexOf('#') - row.indexOf('#') + 1,
      );
      const from = Math.floor(pumpkin.height * 0.35);
      const to = Math.ceil(pumpkin.height * 0.65);
      const middle = widths.slice(from, to);
      const waistWidth = Math.min(...middle);
      const waist = from + middle.indexOf(waistWidth);
      expect(Math.max(...widths.slice(0, waist))).toBeGreaterThanOrEqual(
        waistWidth + 4,
      );
      expect(Math.max(...widths.slice(waist))).toBeGreaterThanOrEqual(
        waistWidth + 4,
      );
    },
  );

  it('obstacleSprite maps each kind to its cactus', () => {
    expect(obstacleSprite('small')).toBe(Sprites.cactusSmall);
    expect(obstacleSprite('large')).toBe(Sprites.cactusLarge);
  });

  it('the ground tile is a full-width line on top', () => {
    const ground = Sprites.ground;
    expect(ground.bitmap[0]).toBe('#'.repeat(ground.width));
  });
});

describe('halloween sprites', () => {
  const glowPixels = (sprite: Sprite): number =>
    sprite.glowRuns.reduce((sum, run) => sum + run.width, 0);

  it('exposes exactly the expected set of sprite names', () => {
    expect(Object.keys(Sprites).sort()).toEqual(
      [
        'bat0',
        'bat1',
        'cactusLarge',
        'cactusSmall',
        'candy',
        'dinoDuck0',
        'dinoDuck1',
        'dinoHit',
        'dinoRun0',
        'dinoRun1',
        'dinoStand',
        'ground',
        'heart',
        'hat',
        'pumpkinLarge',
        'pumpkinSmall',
      ].sort(),
    );
  });

  it.each([
    ['dinoDuck0', Sprites.dinoDuck0],
    ['dinoDuck1', Sprites.dinoDuck1],
  ] as const)('%s is about 59 by 30 with a 24 px tall hitbox', (_n, duck) => {
    expect(duck.width).toBeGreaterThanOrEqual(56);
    expect(duck.width).toBeLessThanOrEqual(62);
    expect(duck.height).toBe(30);
    expect(duck.bitmap).toHaveLength(30);
    expect(duck.hitbox.height).toBe(24);
    expect(duck.hitbox.y).toBe(duck.height - 24);
    expect(duck.hitbox.x).toBeGreaterThan(0);
    expect(duck.hitbox.x + duck.hitbox.width).toBeLessThan(duck.width);
  });

  it('the two duck frames differ and share the same upper body', () => {
    const { dinoDuck0, dinoDuck1 } = Sprites;
    expect(dinoDuck0.bitmap).not.toEqual(dinoDuck1.bitmap);
    expect(dinoDuck0.width).toBe(dinoDuck1.width);
    expect(dinoDuck0.bitmap.slice(0, 24)).toEqual(
      dinoDuck1.bitmap.slice(0, 24),
    );
    expect(dinoDuck0.hitbox).toEqual(dinoDuck1.hitbox);
  });

  it.each([
    ['bat0', Sprites.bat0],
    ['bat1', Sprites.bat1],
  ] as const)(
    '%s is about 44 by 52, full height hitbox inset on both sides, orange eyes',
    (_n, bat) => {
      expect(bat.width).toBe(44);
      expect(bat.height).toBe(52);
      expect(bat.hitbox.y).toBe(0);
      expect(bat.hitbox.height).toBe(52);
      expect(bat.hitbox.x).toBeGreaterThanOrEqual(2);
      expect(bat.hitbox.x + bat.hitbox.width).toBeLessThanOrEqual(
        bat.width - 2,
      );
      expect(glowPixels(bat)).toBeGreaterThan(0);
    },
  );

  it('the two bat frames differ (wings up, wings down)', () => {
    expect(Sprites.bat0.bitmap).not.toEqual(Sprites.bat1.bitmap);
    expect(Sprites.bat0.width).toBe(Sprites.bat1.width);
    expect(Sprites.bat0.height).toBe(Sprites.bat1.height);
  });

  it.each([
    ['hat', Sprites.hat, 24, 26, 8],
    ['candy', Sprites.candy, 14, 10, 20],
    ['heart', Sprites.heart, 12, 11, 40],
  ] as const)(
    '%s is %i by %i, has glow and a full-sprite hitbox',
    (_n, sprite, width, height, minGlow) => {
      expect(sprite.width).toBe(width);
      expect(sprite.height).toBe(height);
      expect(sprite.hitbox).toEqual({ x: 0, y: 0, width, height });
      expect(glowPixels(sprite)).toBeGreaterThanOrEqual(minGlow);
    },
  );

  it('the candy has a pale wrapper twist and the heart is all glow', () => {
    expect(Sprites.candy.runs.length).toBeGreaterThan(0);
    expect(Sprites.heart.runs).toEqual([]);
  });
});

describe('computeRuns', () => {
  it('merges adjacent pixels into one run per stretch', () => {
    expect(computeRuns(['##.#', '....', '.###'])).toEqual([
      { x: 0, y: 0, width: 2, height: 1 },
      { x: 3, y: 0, width: 1, height: 1 },
      { x: 1, y: 2, width: 3, height: 1 },
    ]);
  });
});

describe('makeSprite', () => {
  const box = { x: 0, y: 0, width: 1, height: 1 };

  it('rejects rows of unequal length', () => {
    expect(() => makeSprite(['##', '#'], box)).toThrow(/row 1/);
  });

  it('rejects an empty bitmap', () => {
    expect(() => makeSprite([], box)).toThrow();
  });

  it('rejects characters other than #, o and .', () => {
    expect(() => makeSprite(['# '], box)).toThrow(/row 0/);
    expect(() => makeSprite(['#x'], box)).toThrow(/row 0/);
  });

  it('builds runs from # and glowRuns from o', () => {
    const sprite = makeSprite(['#o.o', 'oo##'], box);
    expect(sprite.runs).toEqual([
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 2, y: 1, width: 2, height: 1 },
    ]);
    expect(sprite.glowRuns).toEqual([
      { x: 1, y: 0, width: 1, height: 1 },
      { x: 3, y: 0, width: 1, height: 1 },
      { x: 0, y: 1, width: 2, height: 1 },
    ]);
    expect(sprite.width).toBe(4);
    expect(sprite.height).toBe(2);
    expect(makeSprite(['##'], box).glowRuns).toEqual([]);
  });

  it('rejects a hitbox outside the bitmap', () => {
    expect(() =>
      makeSprite(['##'], { x: 1, y: 0, width: 2, height: 1 }),
    ).toThrow(/hitbox/);
  });
});

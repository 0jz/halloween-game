// The game: the only module that owns run state. A private RunState is advanced
// by the pure `step` and projected onto the public GameState (architecture 2.2,
// State conventions; technical considerations 2.2 and 2.4). Pure: no DOM, no clock.
//
// Slice 2 adds the start step and running at constant START_SPEED (score,
// run cycle, `tick` event) plus the frame accumulator; slice 3 adds jumping
// (steps 4 and 5, `jump` and `land`); slice 4 adds obstacles (steps 6 and 7,
// `spawn`); slice 5 adds death (step 9, `die`); slice 6 adds restart (step 1
// from `dead`); slice 7 adds the speed ramp (step 3, `speedChange`); slice 8
// adds milestones with the score blink (step 8) and the high score rule (step 9).

import { assertNever } from './assert.js';
import {
  advanceBats,
  batRngStart,
  canPlaceBat,
  firstBatTick,
  makeBat,
  nextBatInterval,
  widenSpawnX,
} from './bats.js';
import { hasCollision, intersects } from './collision.js';
import { createBus } from './events.js';
import {
  advanceObstacles,
  firstSpawnX,
  laterSpeedBound,
  makeGroup,
  missingKind,
  nextGapPx,
  shouldSpawn,
  speedAt,
  trailingEdge,
} from './obstacles.js';
import { applyGravity, isOnGround, startJump } from './physics.js';
import {
  advanceScore,
  beatsHighScore,
  isMilestone,
  scoreFromDistance,
} from './score.js';
import {
  advanceCandies,
  advanceHat,
  candyRngStart,
  canPlaceCandy,
  canPlaceHat,
  dinoVisible,
  firstHatTick,
  gainHeart,
  hatAllowsSpawn,
  hatRngStart,
  isProtected,
  loseHeart,
  makeCandy,
  makeHat,
  nextCandyInterval,
  nextHatDelay,
  startProtection,
  tickProtection,
  widenSpawnXForCandy,
  widenSpawnXForHat,
} from './pickups.js';
import { Sprites } from './sprites.js';
import {
  BLINK_SCHEDULE,
  CANVAS,
  DINO_X,
  FRAME_CLAMP_MS,
  GROUND_Y,
  RUN_FRAME_TICKS,
  START_SPEED,
  STEP_MS,
} from './tuning.js';
import type {
  Bat,
  Candy,
  Dino,
  DinoPose,
  Game,
  GameDeps,
  GameEvent,
  GameState,
  Hat,
  Intent,
  Obstacle,
  ObstacleKind,
  Phase,
} from './types.js';

/** The dino's own state; size, pose and hitbox are derived in `project`. */
interface DinoRun {
  readonly y: number; // top edge, logical px
  readonly vy: number; // px per step; negative is upward
  readonly onGround: boolean;
  readonly frame: 0 | 1;
}

/**
 * Everything one run needs. Holds the public fields that are not derived,
 * plus the obstacle spawner's state and the milestone blink's start
 * (technical considerations 2.2).
 */
interface RunState {
  readonly phase: Phase;
  readonly tick: number;
  readonly seed: number | null;
  readonly speed: number;
  /** Px the world has moved in this run: the sum of every step's `speed`. */
  readonly scrollX: number;
  /** Exact, unfloored score distance; `score` is derived from it. */
  readonly distance: number;
  readonly score: number;
  readonly hi: number | null;
  readonly dino: DinoRun;
  readonly obstacles: readonly Obstacle[];
  readonly spawnLog: readonly {
    readonly kind: ObstacleKind;
    readonly group: number;
    readonly tick: number;
  }[];
  /** The run's uint32 rng state; advanced only inside a step. */
  readonly rngState: number;
  /** Planned left edge of the next group, in screen px; scrolls with the world. */
  readonly nextSpawnX: number;
  readonly nextObstacleId: number;
  readonly nextGroup: number;
  /** Tick of this run's latest milestone; null before the first one. */
  readonly blinkStartedAt: number | null;
  /** True only while grounded and the DOWN key is held (technical considerations 2.4). */
  readonly ducking: boolean;
  /** Last duck intent dispatched since the previous step; last one wins. */
  readonly pendingDuck: 'duckDown' | 'duckUp' | null;
  readonly bats: readonly Bat[];
  /** The bat stream's uint32 state, separate from `rngState`. */
  readonly batRngState: number;
  /** Tick at which the next bat is due (retried each tick until placed). */
  readonly nextBatTick: number;
  readonly nextBatId: number;
  /** Tick of the last placed bat; null before the first. */
  readonly lastBatTick: number | null;
  readonly hat: Hat | null;
  /** The hat stream's uint32 state, separate from the bat and game streams. */
  readonly hatRngState: number;
  /** Tick at which the next hat is due (retried each tick until placed). */
  readonly nextHatTick: number;
  readonly candies: readonly Candy[];
  /** The candy stream's uint32 state. */
  readonly candyRngState: number;
  /** Tick at which the next candy is due; infinite until the hat is caught. */
  readonly nextCandyTick: number;
  readonly nextCandyId: number;
  readonly hearts: number;
  readonly candyTime: boolean;
  readonly invulnTicks: number;
}

/** What a step needs from `createGame`'s dependencies. */
interface StepDeps {
  /** Called exactly once on a step that starts a run. */
  readonly newSeed: () => number;
  /** `false` skips step 9, so a run never dies (tests of long runs). */
  readonly collisions: boolean;
  /** Persists a new high score; called at most once, on the dying step. */
  readonly saveHighScore: (score: number) => void;
}

interface StepResult {
  readonly run: RunState;
  readonly events: readonly GameEvent[];
}

/** The y of a sprite of the given height standing with its feet on the ground line. */
function groundedY(height: number): number {
  return GROUND_Y - height;
}

/** Where the dino's top edge rests when it stands on the ground. */
const DINO_REST_Y = groundedY(Sprites.dinoStand.height);

function groundedDino(): DinoRun {
  return { y: DINO_REST_Y, vy: 0, onGround: true, frame: 0 };
}

/** The idle run shown on the start screen. Calls no `randomSeed`: seeds are drawn at start. */
function initialRun(deps: GameDeps): RunState {
  return {
    phase: 'idle',
    tick: 0,
    // A seeded page knows its seed before the first run; an unseeded one does not.
    seed: deps.seed ?? null,
    speed: START_SPEED,
    scrollX: 0,
    distance: 0,
    score: 0,
    hi: deps.store.load(),
    dino: groundedDino(),
    obstacles: [],
    spawnLog: [],
    // Idle never spawns; the start step builds the real spawner state.
    rngState: 0,
    nextSpawnX: Number.POSITIVE_INFINITY,
    nextObstacleId: 0,
    nextGroup: 0,
    blinkStartedAt: null,
    ducking: false,
    pendingDuck: null,
    bats: [],
    batRngState: 0,
    nextBatTick: Number.POSITIVE_INFINITY,
    nextBatId: 0,
    lastBatTick: null,
    hat: null,
    hatRngState: 0,
    nextHatTick: Number.POSITIVE_INFINITY,
    candies: [],
    candyRngState: 0,
    nextCandyTick: Number.POSITIVE_INFINITY,
    nextCandyId: 0,
    hearts: 0,
    candyTime: false,
    invulnTicks: 0,
  };
}

/**
 * A fresh running run built from `tuning.ts` (technical considerations 2.4
 * step 1). Only the high score carries over. Nothing moves on the step that
 * starts a run. The rng state comes from the seed, as in `createRng`.
 */
function freshRun(seed: number, previous: RunState): RunState {
  const [nextSpawnX, rngState] = firstSpawnX(seed >>> 0);
  const [nextBatTick, batRngState] = firstBatTick(batRngStart(seed));
  return {
    ...previous,
    phase: 'running',
    tick: 0,
    seed,
    speed: START_SPEED,
    scrollX: 0,
    distance: 0,
    score: 0,
    dino: groundedDino(),
    obstacles: [],
    spawnLog: [],
    rngState,
    nextSpawnX,
    nextObstacleId: 0,
    nextGroup: 0,
    blinkStartedAt: null,
    ducking: false,
    pendingDuck: null,
    bats: [],
    batRngState,
    nextBatTick,
    nextBatId: 0,
    lastBatTick: null,
    hat: null,
    hatRngState: hatRngStart(seed),
    nextHatTick: firstHatTick(),
    candies: [],
    candyRngState: candyRngStart(seed),
    nextCandyTick: Number.POSITIVE_INFINITY,
    nextCandyId: 0,
    hearts: 0,
    candyTime: false,
    invulnTicks: 0,
  };
}

/**
 * Step 1 for a start (from `idle`) or a restart (from `dead`): one `newSeed()`
 * call, a fresh run from `tuning.ts` keeping only `hi`, and exactly one event
 * naming which it was. Nothing moves on this step.
 */
function beginRun(
  run: RunState,
  type: 'start' | 'restart',
  deps: StepDeps,
): StepResult {
  const seed = deps.newSeed();
  return { run: freshRun(seed, run), events: [{ type, seed }] };
}

/** Absorbs floating-point error in `speedBucket`; far below one tick's speed change. */
const SPEED_BUCKET_EPSILON = 1e-9;

/** The 0.1x multiple of START_SPEED that `speed` has reached (10 at START_SPEED). */
function speedBucket(speed: number): number {
  // The tolerance keeps exact crossings exact: speedAt(2160) / START_SPEED * 10
  // is 13.999999999999998 in floating point, not 14.
  return Math.floor((speed / START_SPEED) * 10 + SPEED_BUCKET_EPSILON);
}

/** The run-cycle frame after a running step: toggles every RUN_FRAME_TICKS on the ground. */
function nextRunFrame(dino: DinoRun, tick: number): 0 | 1 {
  if (!dino.onGround || tick % RUN_FRAME_TICKS !== 0) {
    return dino.frame;
  }
  return dino.frame === 0 ? 1 : 0;
}

function poseFor(phase: Phase): DinoPose {
  switch (phase) {
    case 'idle':
      return 'stand';
    case 'running':
      return 'run';
    case 'dead':
      return 'hit';
    default:
      return assertNever(phase);
  }
}

function hintFor(phase: Phase): GameState['hud']['hint'] {
  switch (phase) {
    case 'idle':
      return 'start';
    case 'running':
      return null;
    case 'dead':
      return 'restart';
    default:
      return assertNever(phase);
  }
}

/**
 * Whether the score shows (step 10): hidden only while running, on the ticks
 * since the latest milestone that fall in a BLINK_SCHEDULE range.
 */
function isBlinkVisible(run: RunState): boolean {
  if (run.phase !== 'running' || run.blinkStartedAt === null) {
    return true;
  }
  const elapsed = run.tick - run.blinkStartedAt;
  return !BLINK_SCHEDULE.some(([from, to]) => elapsed >= from && elapsed <= to);
}

function projectDino(run: RunState): Dino {
  if (run.phase === 'running' && run.ducking) {
    // Physics `y` is unchanged; the duck sprite is shorter with its bottom on
    // the same line, so only the projected `y` and hitbox move.
    const duck = run.dino.frame === 0 ? Sprites.dinoDuck0 : Sprites.dinoDuck1;
    const y = run.dino.y + (Sprites.dinoStand.height - duck.height);
    return {
      x: DINO_X,
      y,
      width: duck.width,
      height: duck.height,
      onGround: run.dino.onGround,
      pose: 'duck',
      frame: run.dino.frame,
      hitbox: {
        x: DINO_X + duck.hitbox.x,
        y: y + duck.hitbox.y,
        width: duck.hitbox.width,
        height: duck.hitbox.height,
      },
    };
  }
  // The stand, run and hit sprites share one size and hitbox, so the geometry
  // comes from the standing one; the renderer picks the drawn sprite from
  // `pose` and `frame`.
  const sprite = Sprites.dinoStand;
  const { x: hx, y: hy, width: hw, height: hh } = sprite.hitbox;
  return {
    x: DINO_X,
    y: run.dino.y,
    width: sprite.width,
    height: sprite.height,
    onGround: run.dino.onGround,
    pose: poseFor(run.phase),
    frame: run.dino.frame,
    hitbox: { x: DINO_X + hx, y: run.dino.y + hy, width: hw, height: hh },
  };
}

/** The public view of a run. HUD fields are derived here, never stored. */
function project(run: RunState): GameState {
  return {
    phase: run.phase,
    tick: run.tick,
    seed: run.seed,
    speed: run.speed,
    scrollX: run.scrollX,
    score: run.score,
    hi: run.hi,
    dino: projectDino(run),
    obstacles: run.obstacles,
    bats: run.bats,
    hat: run.hat,
    candies: run.candies,
    hearts: run.hearts,
    candyTime: run.candyTime,
    invulnTicks: run.invulnTicks,
    spawnLog: run.spawnLog,
    hud: {
      hint: hintFor(run.phase),
      gameOver: run.phase === 'dead',
      blinkVisible: isBlinkVisible(run),
      dinoVisible: dinoVisible(run.invulnTicks),
    },
  };
}

/**
 * One fixed step of 1/60 s (technical considerations 2.4). Returns the next
 * run and the events to emit, in order. Its only outside input is `newSeed`,
 * called exactly once on a step that starts a run.
 */
function step(
  run: RunState,
  intent: Intent | undefined,
  deps: StepDeps,
): StepResult {
  switch (run.phase) {
    case 'idle':
      // Step 1: `primary` in idle starts a fresh run and moves nothing.
      if (intent === 'primary') {
        return beginRun(run, 'start', deps);
      }
      // Step 2: nothing else happens on the start screen.
      return { run, events: [] };
    case 'running':
      return stepRunning(run, intent, deps);
    case 'dead':
      // Step 1: `primary` in dead restarts: the same fresh run as a start,
      // announced as `restart` only (never also `start`).
      if (intent === 'primary') {
        return beginRun(run, 'restart', deps);
      }
      // Step 2: otherwise the game-over screen is frozen and emits nothing.
      return { run, events: [] };
    default:
      return assertNever(run.phase);
  }
}

/**
 * Steps 6 and 7: scroll the obstacles and the spawn target by `speed`, drop
 * obstacles past the left edge, and spawn at most one group once the target
 * reaches the right edge. Appends one `spawn` event per obstacle, in group order.
 */
function stepObstacles(
  run: RunState,
  tick: number,
  speed: number,
  events: GameEvent[],
): RunState {
  const obstacles = advanceObstacles(run.obstacles, speed);
  const nextSpawnX = run.nextSpawnX - speed;
  if (!shouldSpawn(nextSpawnX) || !hatAllowsSpawn(run.hat, speed)) {
    return { ...run, obstacles, nextSpawnX };
  }
  const forcedKind = missingKind(
    run.spawnLog.map((entry) => entry.kind),
    run.nextGroup,
  );
  const [group, afterGroup] = makeGroup({
    rngState: run.rngState,
    x: nextSpawnX,
    nextId: run.nextObstacleId,
    group: run.nextGroup,
    forcedKind,
  });
  const trailing = trailingEdge(group);
  const [gap, rngState] = nextGapPx(
    afterGroup,
    speed,
    laterSpeedBound(tick, speed, trailing),
  );
  for (const obstacle of group) {
    events.push({ type: 'spawn', obstacle });
  }
  return {
    ...run,
    obstacles: [...obstacles, ...group],
    spawnLog: [
      ...run.spawnLog,
      ...group.map((o) => ({ kind: o.kind, group: o.group, tick })),
    ],
    rngState,
    nextSpawnX: trailing + gap,
    nextObstacleId: run.nextObstacleId + group.length,
    nextGroup: run.nextGroup + 1,
  };
}

/**
 * Bat steps (after the pumpkin spawn): scroll and drop bats, then place the
 * due bat at the right edge when the space allows (otherwise retry next tick),
 * widen the next pumpkin x, and draw the next due tick from the bat stream.
 */
function stepBats(
  run: RunState,
  tick: number,
  speed: number,
  events: GameEvent[],
): RunState {
  const bats = advanceBats(run.bats, speed, tick);
  const request = {
    tick,
    speed,
    obstacles: run.obstacles,
    lastBatTick: run.lastBatTick ?? undefined,
  };
  if (
    tick < run.nextBatTick ||
    !hatAllowsSpawn(run.hat, speed) ||
    !canPlaceBat(request)
  ) {
    return { ...run, bats };
  }
  const bat = makeBat(run.nextBatId, CANVAS.width, tick);
  const [interval, batRngState] = nextBatInterval(run.batRngState);
  events.push({ type: 'batSpawn', bat });
  return {
    ...run,
    bats: [...bats, bat],
    batRngState,
    nextBatTick: tick + interval,
    nextBatId: run.nextBatId + 1,
    lastBatTick: tick,
    nextSpawnX: widenSpawnX(run.nextSpawnX, bat, tick, speed),
  };
}

/**
 * Hat and candy steps (after the bat spawn): scroll and drop both, place the
 * due hat (never after a catch) and the due candy (only in candy time) at the
 * right edge when the space allows, and widen the next pumpkin x past them.
 * A hat that leaves uncaught draws its respawn delay from the hat stream.
 */
function stepPickups(
  run: RunState,
  tick: number,
  speed: number,
  events: GameEvent[],
): RunState {
  let next = run;
  let hat = advanceHat(run.hat, speed);
  if (run.hat !== null && hat === null) {
    const [delay, hatRngState] = nextHatDelay(run.hatRngState);
    next = { ...next, hatRngState, nextHatTick: tick + delay };
  }
  let candies = advanceCandies(run.candies, speed);
  let nextSpawnX = run.nextSpawnX;

  const hatPlaceable = canPlaceHat({
    tick,
    speed,
    obstacles: run.obstacles,
    bats: run.bats,
    dueTick: next.nextHatTick,
    caught: run.candyTime,
    hatOnScreen: hat !== null,
  });
  if (hatPlaceable) {
    hat = makeHat(CANVAS.width);
    nextSpawnX = widenSpawnXForHat(nextSpawnX, hat, speed);
    events.push({ type: 'hatSpawn', hat });
  }

  let { nextCandyId, nextCandyTick, candyRngState } = next;
  if (
    tick >= nextCandyTick &&
    canPlaceCandy({
      candyTime: run.candyTime,
      obstacles: run.obstacles,
      bats: run.bats,
    })
  ) {
    const candy = makeCandy(nextCandyId, CANVAS.width);
    const [interval, after] = nextCandyInterval(candyRngState);
    candyRngState = after;
    nextCandyTick = tick + interval;
    nextCandyId += 1;
    candies = [...candies, candy];
    nextSpawnX = widenSpawnXForCandy(nextSpawnX, candy);
    events.push({ type: 'candySpawn', candy });
  }
  return {
    ...next,
    hat,
    candies,
    nextSpawnX,
    nextCandyId,
    nextCandyTick,
    candyRngState,
  };
}

/**
 * Collision sub-steps in order (technical considerations 2.6): catch the hat
 * (candy time on, first candy scheduled from the candy stream), eat candies,
 * then, when `collisions` is on, the hit test over pumpkins and bats. A hit is
 * ignored while protected; with a heart it costs one and starts protection
 * (no `die`); with none the run ends, saving a new high score once (step 9).
 */
function stepCollision(
  run: RunState,
  tick: number,
  events: GameEvent[],
  deps: StepDeps,
): RunState {
  const dino = projectDino(run);
  let current = run;

  if (current.hat !== null && intersects(dino.hitbox, current.hat.hitbox)) {
    const [interval, candyRngState] = nextCandyInterval(current.candyRngState);
    current = {
      ...current,
      hat: null,
      candyTime: true,
      candyRngState,
      nextCandyTick: tick + interval,
    };
    events.push({ type: 'hatCaught' });
  }

  const eaten = current.candies.filter((c) =>
    intersects(dino.hitbox, c.hitbox),
  );
  if (eaten.length > 0) {
    let hearts = current.hearts;
    eaten.forEach(() => {
      hearts = gainHeart(hearts);
      events.push({ type: 'candyEaten', hearts });
    });
    current = {
      ...current,
      hearts,
      candies: current.candies.filter((c) => !eaten.includes(c)),
    };
  }

  if (
    !deps.collisions ||
    isProtected(current.invulnTicks) ||
    !hasCollision(dino, [...current.obstacles, ...current.bats])
  ) {
    return current;
  }
  if (current.hearts > 0) {
    const hearts = loseHeart(current.hearts);
    events.push({ type: 'heartLost', hearts });
    return { ...current, hearts, invulnTicks: startProtection() };
  }
  const isNewHighScore = beatsHighScore(current.score, current.hi);
  if (isNewHighScore) {
    deps.saveHighScore(current.score);
  }
  const hi = isNewHighScore ? current.score : current.hi;
  events.push({
    type: 'die',
    score: current.score,
    highScore: hi ?? 0,
    isNewHighScore,
  });
  return { ...current, phase: 'dead', hi };
}

/** Steps 3 to 11 for a running run. */
function stepRunning(
  run: RunState,
  intent: Intent | undefined,
  deps: StepDeps,
): StepResult {
  const events: GameEvent[] = [];

  // Step 3: the clock and the speed ramp; `speedChange` is the step's first
  // event, only when the pace crosses a 0.1x multiple of START_SPEED.
  const tick = run.tick + 1;
  const speed = speedAt(tick);
  if (speedBucket(speed) !== speedBucket(run.speed)) {
    events.push({ type: 'speedChange', speed });
  }

  // Step 4: the pending duck change (grounded only), then the jump, which
  // clears `ducking`; `primary` in the air is ignored.
  let body = run.dino;
  let ducking = run.ducking;
  if (run.pendingDuck !== null && isOnGround(body)) {
    const wantsDuck = run.pendingDuck === 'duckDown';
    if (wantsDuck !== ducking) {
      ducking = wantsDuck;
      events.push({ type: wantsDuck ? 'duckStart' : 'duckEnd' });
    }
  }
  if (intent === 'primary' && isOnGround(body)) {
    if (ducking) {
      ducking = false;
      events.push({ type: 'duckEnd' });
    }
    body = startJump(body);
    events.push({ type: 'jump' });
  }

  // Step 5: gravity, independent of `speed`.
  const wasAirborne = !isOnGround(body);
  body = applyGravity(body, DINO_REST_Y);
  if (wasAirborne && isOnGround(body)) {
    events.push({ type: 'land' });
  }

  // Steps 6 and 7: obstacles move, leave, and spawn.
  // The protection countdown runs first, so a hit this step sees this tick's value.
  const counted: RunState = {
    ...run,
    invulnTicks: tickProtection(run.invulnTicks),
  };
  const spawned = stepPickups(
    stepBats(stepObstacles(counted, tick, speed, events), tick, speed, events),
    tick,
    speed,
    events,
  );

  // Step 8: score, capped at MAX_SCORE; crossing a multiple of
  // MILESTONE_EVERY restarts the blink and emits `milestone`.
  const distance = advanceScore(run.distance, speed);
  const score = scoreFromDistance(distance);
  const milestone = isMilestone(run.score, score);
  if (milestone !== null) {
    events.push({ type: 'milestone', score: milestone });
  }

  const moved: RunState = {
    ...spawned,
    tick,
    speed,
    scrollX: run.scrollX + speed,
    distance,
    score,
    dino: body,
    ducking,
    pendingDuck: null,
    blinkStartedAt: milestone === null ? run.blinkStartedAt : tick,
  };

  // Step 9: collision, skipped when `collisions` is false. A hit sets
  // `phase 'dead'`, which makes the pose `'hit'` in `project`.
  const checked = stepCollision(moved, tick, events, deps);

  // Step 10: animation fields (the HUD and pose are derived in `project`).
  // The run frame holds while airborne, judged after this step's physics.
  const dino: DinoRun = { ...body, frame: nextRunFrame(body, tick) };

  // Step 11: `tick` is always last, including on the step that dies.
  events.push({ type: 'tick', tick });

  return { run: { ...checked, dino }, events };
}

/** Whether the dino is mid-jump in a running run (steps 4 and 5). */
function isAirborne(run: RunState): boolean {
  return run.phase === 'running' && !isOnGround(run.dino);
}

export function createGame(deps: GameDeps): Game {
  const bus = deps.bus ?? createBus();
  // A seeded page replays its seed; otherwise one randomSeed() call per run.
  const stepDeps: StepDeps = {
    newSeed: () => deps.seed ?? deps.randomSeed(),
    collisions: deps.collisions ?? true,
    saveHighScore: (score) => {
      deps.store.save(score);
    },
  };
  let run = initialRun(deps);
  const queue: Intent[] = [];
  // Re-entrancy guard: true while a step runs or its events are emitted.
  let isStepping = false;
  // Frame accumulator (architecture 2.2, Fixed timestep and frame driver).
  let lastMs: number | null = null;
  let accumulatorMs = 0;

  function advance(): void {
    // Step 1: at most one queued intent per step, oldest first; the queue
    // waits while the dino is in the air.
    const intent = isAirborne(run) ? undefined : queue.shift();
    const result = step(run, intent, stepDeps);
    // Commit first, so a listener calling state() sees the post-step run.
    run = result.run;
    for (const event of result.events) {
      bus.emit(event);
    }
  }

  /** Throws when called from inside a step, i.e. from an event listener. */
  function assertNotStepping(caller: 'tick' | 'frame'): void {
    if (isStepping) {
      throw new Error(
        `game.${caller}() cannot be called from an event listener; use game.dispatch() instead`,
      );
    }
  }

  function runSteps(n: number): void {
    isStepping = true;
    try {
      for (let i = 0; i < n; i += 1) {
        advance();
      }
    } finally {
      isStepping = false;
    }
  }

  function frame(nowMs: number): number {
    assertNotStepping('frame');
    if (lastMs === null) {
      lastMs = nowMs;
      return 0;
    }
    const elapsed = Math.min(Math.max(nowMs - lastMs, 0), FRAME_CLAMP_MS);
    lastMs = nowMs;
    accumulatorMs += elapsed;
    let steps = 0;
    // The epsilon makes a clamped 100 ms frame run exactly 6 steps.
    while (accumulatorMs >= STEP_MS - 1e-6) {
      accumulatorMs -= STEP_MS;
      steps += 1;
    }
    runSteps(steps);
    return steps;
  }

  return {
    tick: (n = 1) => {
      assertNotStepping('tick');
      runSteps(n);
    },
    frame,
    dispatch: (intent) => {
      // Step 4: input in the air, idle or dead is ignored; duck intents
      // bypass the primary queue (last wins).
      if (isAirborne(run)) return;
      if (intent === 'primary') {
        queue.push(intent);
      } else if (run.phase === 'running') {
        run = { ...run, pendingDuck: intent };
      }
    },
    state: () => structuredClone(project(run)),
    view: () => project(run),
    on: (type, handler) => bus.on(type, handler),
  };
}

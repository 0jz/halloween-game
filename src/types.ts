// Shapes shared by several modules. The names and shapes below are the frozen
// testing contract (architecture section 3): add to them, never rename or remove.

export type Intent = 'primary';
export type Phase = 'idle' | 'running' | 'dead';
export type DinoPose = 'stand' | 'run' | 'hit';
export type ObstacleKind = 'small' | 'large';
export type LayerName =
  'background' | 'parallax' | 'world' | 'foreground' | 'hud';

// Logical canvas pixels: origin top-left, y grows downward, (x, y) is the top-left corner.
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Dino extends Rect {
  readonly onGround: boolean;
  readonly pose: DinoPose; // 'hit' only when phase === 'dead'
  readonly frame: 0 | 1; // run-cycle frame
  readonly hitbox: Rect; // absolute; what collision uses
}

export interface Obstacle extends Rect {
  readonly id: number; // 0, 1, 2 … within a run; resets on start and restart
  readonly group: number; // 0, 1, 2 … within a run; obstacles of one group share it
  readonly kind: ObstacleKind;
  readonly hitbox: Rect;
}

export interface GameDeps {
  seed?: number | undefined; // from the URL; undefined means a random seed per run
  randomSeed: () => number; // main.ts: Math.random based; tests: a stub
  store: HighScoreStore; // main.ts: localStorage adapter; tests: in-memory
  bus?: EventBus | undefined; // createGame makes one if absent
  collisions?: boolean | undefined; // default true; false only in tests, to keep a run alive
}

export interface GameState {
  readonly phase: Phase;
  readonly tick: number; // running steps in this run; 0 in idle and right after (re)start
  readonly seed: number | null; // this run's seed; null before the first run of an unseeded page
  readonly speed: number; // px per step
  readonly scrollX: number; // px the world has moved in this run (sum of per-step speeds); 0 in idle and after (re)start
  readonly score: number; // whole points, floored, capped at MAX_SCORE
  readonly hi: number | null; // null when no high score has ever been recorded
  readonly dino: Dino;
  readonly obstacles: readonly Obstacle[];
  // one entry per obstacle, this run only
  readonly spawnLog: readonly {
    readonly kind: ObstacleKind;
    readonly group: number;
    readonly tick: number;
  }[];
  readonly hud: {
    readonly hint: 'start' | 'restart' | null;
    readonly gameOver: boolean;
    readonly blinkVisible: boolean;
  };
}

export interface Game {
  tick(n?: number): void; // advance exactly n steps (default 1)
  frame(nowMs: number): number; // browser accumulator; returns steps run
  dispatch(intent: Intent): void; // queued, applied at the next step
  state(): GameState; // plain, JSON-serialisable deep copy
  view(): GameState; // live projection for the renderer; do not keep across steps
  on: EventSource['on'];
}

export type GameEvent =
  | { type: 'start'; seed: number }
  | { type: 'tick'; tick: number }
  | { type: 'jump' }
  | { type: 'land' }
  | { type: 'spawn'; obstacle: Obstacle }
  | { type: 'milestone'; score: number }
  | { type: 'speedChange'; speed: number }
  | { type: 'die'; score: number; highScore: number; isNewHighScore: boolean }
  | { type: 'restart'; seed: number };

export interface EventSource {
  on<K extends GameEvent['type']>(
    type: K,
    handler: (e: Extract<GameEvent, { type: K }>) => void,
  ): () => void;
  off<K extends GameEvent['type']>(
    type: K,
    handler: (e: Extract<GameEvent, { type: K }>) => void,
  ): void;
}

export interface EventBus extends EventSource {
  emit(event: GameEvent): void;
}

export interface HighScoreStore {
  load(): number | null;
  save(score: number): void;
}

export interface Rng {
  next(): number; // [0, 1)
}

export type DrawContext = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'globalAlpha'
  | 'fillRect'
  | 'fillText'
  | 'translate'
  | 'save'
  | 'restore'
>;

export interface RenderFrame {
  readonly count: number; // render frames since page load; visuals only
}

export type LayerDraw = (
  ctx: DrawContext,
  state: GameState,
  frame: RenderFrame,
) => void;

// The read-only test hook main.ts installs as window.__dino (see src/global.d.ts).
export interface DinoHook {
  readonly state: () => GameState;
  readonly seed: number | undefined;
  readonly version: number;
}

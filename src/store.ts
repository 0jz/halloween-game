// High-score stores. Pure: `createStorageStore` works over any key-value
// storage handed to it (main.ts passes localStorage), and main.ts falls back to
// `createMemoryStore` when storage is unavailable (architecture section 4);
// tests may use either as a plain store.

import { MAX_SCORE } from './tuning.js';
import type { HighScoreStore } from './types.js';

/** A `HighScoreStore` that keeps the best score in a closure, starting at `initial`. */
export function createMemoryStore(
  initial: number | null = null,
): HighScoreStore {
  let hi = initial;
  return {
    load: () => hi,
    save: (score) => {
      hi = score;
    },
  };
}

/** The slice of `Storage` the store uses; `window.localStorage` satisfies it. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * A stored best score as a number, or null when absent or not a score the game
 * could have produced: non-numeric, negative, fractional or above MAX_SCORE.
 */
function parseHighScore(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const score = Number(raw);
  return score <= MAX_SCORE ? score : null;
}

/**
 * The high score kept under `key` as a decimal integer string (technical
 * considerations 2.7). Storage can throw (private mode, disabled or full
 * storage), so every access is guarded: a failed read is "no high score", a
 * failed write is dropped. `save` re-reads the stored value and never lowers
 * it, so another tab that recorded a higher best in the meantime keeps it.
 */
export function createStorageStore(
  storage: KeyValueStorage,
  key: string,
): HighScoreStore {
  const load = (): number | null => {
    try {
      return parseHighScore(storage.getItem(key));
    } catch {
      return null;
    }
  };
  return {
    load,
    save(score) {
      const stored = load();
      if (stored !== null && stored >= score) return;
      try {
        storage.setItem(key, String(score));
      } catch {
        // Losing a high score is better than crashing the game.
      }
    },
  };
}

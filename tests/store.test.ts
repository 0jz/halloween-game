import { describe, expect, it } from 'vitest';
import { createStorageStore } from '../src/store.js';
import { MAX_SCORE } from '../src/tuning.js';

const KEY = 'dino.hi';

/** A Map-backed stand-in for localStorage. */
function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
}

/** Storage that throws on every access, like disabled or full storage. */
const brokenStorage = {
  getItem: (): string | null => {
    throw new Error('denied');
  },
  setItem: (): void => {
    throw new Error('denied');
  },
};

describe('createStorageStore load', () => {
  it('reads a stored decimal integer', () => {
    expect(createStorageStore(fakeStorage({ [KEY]: '123' }), KEY).load()).toBe(
      123,
    );
  });

  it('accepts MAX_SCORE itself', () => {
    const storage = fakeStorage({ [KEY]: String(MAX_SCORE) });
    expect(createStorageStore(storage, KEY).load()).toBe(MAX_SCORE);
  });

  it.each([
    ['an absent value', undefined],
    ['a non-numeric value', 'abc'],
    ['a negative value', '-5'],
    ['a fractional value', '4.2'],
    ['a value above MAX_SCORE', String(MAX_SCORE + 1)],
    ['a value so long it parses to Infinity', '9'.repeat(400)],
  ])('treats %s as no high score', (_, raw) => {
    const storage = fakeStorage(raw === undefined ? {} : { [KEY]: raw });
    expect(createStorageStore(storage, KEY).load()).toBeNull();
  });

  it('returns null when storage throws', () => {
    expect(createStorageStore(brokenStorage, KEY).load()).toBeNull();
  });
});

describe('createStorageStore save', () => {
  it('writes the first best score', () => {
    const storage = fakeStorage();
    createStorageStore(storage, KEY).save(42);
    expect(storage.items.get(KEY)).toBe('42');
  });

  it('writes a score higher than the stored best', () => {
    const storage = fakeStorage({ [KEY]: '500' });
    createStorageStore(storage, KEY).save(600);
    expect(storage.items.get(KEY)).toBe('600');
  });

  it('never lowers a best that another tab stored after this one loaded', () => {
    const storage = fakeStorage();
    const tabA = createStorageStore(storage, KEY);
    const tabB = createStorageStore(storage, KEY);
    expect(tabB.load()).toBeNull();
    tabA.save(500);
    tabB.save(300);
    expect(storage.items.get(KEY)).toBe('500');
  });

  it('replaces a stored value that is not a valid score', () => {
    const storage = fakeStorage({ [KEY]: String(MAX_SCORE + 1) });
    createStorageStore(storage, KEY).save(10);
    expect(storage.items.get(KEY)).toBe('10');
  });

  it('does not throw when storage throws', () => {
    expect(() => {
      createStorageStore(brokenStorage, KEY).save(10);
    }).not.toThrow();
  });
});

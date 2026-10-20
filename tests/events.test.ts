import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBus } from '../src/events.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createBus', () => {
  it('delivers an event only to handlers of its type', () => {
    const bus = createBus();
    const seen: number[] = [];
    bus.on('tick', (e) => seen.push(e.tick));
    bus.on('jump', () => seen.push(-1));

    bus.emit({ type: 'tick', tick: 7 });

    expect(seen).toEqual([7]);
  });

  it('keeps one copy of a handler registered twice', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('jump', handler);
    bus.on('jump', handler);

    bus.emit({ type: 'jump' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('stops delivering after unsubscribe or off', () => {
    const bus = createBus();
    const a = vi.fn();
    const b = vi.fn();
    const unsubscribe = bus.on('land', a);
    bus.on('land', b);

    unsubscribe();
    bus.off('land', b);
    bus.emit({ type: 'land' });

    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('lets a handler unsubscribe itself during emit without skipping others', () => {
    const bus = createBus();
    const calls: string[] = [];
    const unsubscribe = bus.on('jump', () => {
      calls.push('once');
      unsubscribe();
    });
    bus.on('jump', () => calls.push('always'));

    bus.emit({ type: 'jump' });
    bus.emit({ type: 'jump' });

    expect(calls).toEqual(['once', 'always', 'always']);
  });

  it('does not deliver an emit to a handler added during that emit', () => {
    const bus = createBus();
    const late = vi.fn();
    bus.on('jump', () => {
      bus.on('jump', late);
    });

    bus.emit({ type: 'jump' });
    expect(late).not.toHaveBeenCalled();

    bus.emit({ type: 'jump' });
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing handler and rethrows its error in a microtask', () => {
    const queued: (() => void)[] = [];
    vi.stubGlobal('queueMicrotask', (task: () => void) => {
      queued.push(task);
    });
    const bus = createBus();
    const boom = new Error('boom');
    const after = vi.fn();
    bus.on('die', () => {
      throw boom;
    });
    bus.on('die', after);

    expect(() => {
      bus.emit({ type: 'die', score: 5, highScore: 5, isNewHighScore: true });
    }).not.toThrow();

    expect(after).toHaveBeenCalledTimes(1);
    expect(queued).toHaveLength(1);
    const [rethrow] = queued;
    expect(rethrow).toThrow(boom);
  });
});

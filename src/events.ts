// The typed event bus: the only coupling between gameplay and features.
// Gameplay emits, features subscribe (architecture 2.2).

import type { EventBus, GameEvent } from './types.js';

type EventType = GameEvent['type'];
type EventOf<K extends EventType> = Extract<GameEvent, { type: K }>;
type Handler<K extends EventType> = (e: EventOf<K>) => void;

// One Set per event type. The mapped type ties each key to handlers of the
// matching event, so reading `handlers[type]` with a generic K needs no cast.
type HandlerMap = { [K in EventType]: Set<Handler<K>> };

export function createBus(): EventBus {
  const handlers: HandlerMap = {
    start: new Set(),
    tick: new Set(),
    jump: new Set(),
    land: new Set(),
    spawn: new Set(),
    milestone: new Set(),
    speedChange: new Set(),
    die: new Set(),
    restart: new Set(),
  };

  function off<K extends EventType>(type: K, handler: Handler<K>): void {
    handlers[type].delete(handler);
  }

  function on<K extends EventType>(type: K, handler: Handler<K>): () => void {
    // A Set keeps one copy, so registering the same handler twice is harmless.
    handlers[type].add(handler);
    return () => {
      off(type, handler);
    };
  }

  // Generic over K so the event and the handler set are known to match.
  function deliver<K extends EventType>(type: K, event: EventOf<K>): void {
    // Iterate a copy: a handler may unsubscribe itself (or others) mid-emit.
    for (const handler of [...handlers[type]]) {
      try {
        handler(event);
      } catch (error) {
        // One broken listener must not stop the rest or the game loop.
        // Rethrow later so the error still surfaces (e.g. as a page error).
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  return {
    on,
    off,
    emit: (event) => {
      deliver(event.type, event);
    },
  };
}

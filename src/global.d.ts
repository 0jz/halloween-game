import type { DinoHook } from './types.js';

declare global {
  interface Window {
    __dino: DinoHook;
  }
}

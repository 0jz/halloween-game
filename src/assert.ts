// Exhaustiveness helper: every `switch` on a union ends in `assertNever`
// (CLAUDE.md), so adding a union member without handling it is a type error.

/** Unreachable when every case is handled; throws if reached at runtime anyway. */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

import { describe, expect, it } from 'vitest';
import {
  ALLOW_MARKER,
  findSecrets,
  redact,
  scanDiff,
} from '../../.claude/hooks/secret-scan.mjs';
import { fakeKey, fakeSecrets } from './fakes.js';

describe('findSecrets', () => {
  it.each(Object.entries(fakeSecrets))('finds a %s', (name, secret) => {
    expect(findSecrets(`const value = "${secret}";`)).toEqual([name]);
  });

  it.each([
    'export ANTHROPIC_AUTH_TOKEN=sk-...',
    'export ANTHROPIC_AUTH_TOKEN="$ANTHROPIC_AUTH_TOKEN"',
    'ANTHROPIC_AUTH_TOKEN: ${{ secrets.GATEWAY_KEY }}',
    'ANTHROPIC_AUTH_TOKEN=<your key from the portal>',
    'the task-runner-for-the-whole-pipeline',
    'AKIA',
  ])('leaves a placeholder or ordinary text alone: %s', (line) => {
    expect(findSecrets(line)).toEqual([]);
  });

  it('skips a line carrying the allow marker', () => {
    const line = `const example = "${fakeKey}"; // ${ALLOW_MARKER}`;
    expect(findSecrets(line)).toEqual([]);
  });
});

describe('redact', () => {
  it('replaces every secret and keeps the rest of the text', () => {
    const key = fakeKey;
    expect(redact(`my key is ${key}, why 401?`)).toBe(
      'my key is [REDACTED], why 401?',
    );
  });
});

describe('scanDiff', () => {
  it('reports file and line of added lines only', () => {
    const key = fakeKey;
    const diff = [
      'diff --git a/src/config.ts b/src/config.ts',
      '--- a/src/config.ts',
      '+++ b/src/config.ts',
      '@@ -3,0 +4,2 @@',
      '+const harmless = 1;',
      `+const key = "${key}";`,
      `-const removed = "${key}";`,
    ].join('\n');
    expect(scanDiff(diff)).toEqual([
      { pattern: 'API key (sk-...)', file: 'src/config.ts', line: 5 },
    ]);
  });
});

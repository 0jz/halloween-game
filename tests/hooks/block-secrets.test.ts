import { describe, expect, it } from 'vitest';
import { decide } from '../../.claude/hooks/block-secrets.mjs';
import type { Finding } from '../../.claude/hooks/secret-scan.mjs';
import { fakeKey } from './fakes.js';

const projectDir = '/work/dino';
const hit: Finding[] = [
  { pattern: 'API key (sk-...)', file: 'src/a.ts', line: 3 },
];

/** An environment with no secrets anywhere and no ignored files, unless overridden. */
function env(overrides: Partial<Parameters<typeof decide>[1]> = {}) {
  const calls: string[] = [];
  return {
    calls,
    env: {
      projectDir,
      isIgnored: () => false,
      scanStaged: () => (calls.push('staged'), []),
      scanWorkingTree: () => (calls.push('working tree'), []),
      scanUnpushed: () => (calls.push('unpushed'), []),
      ...overrides,
    },
  };
}

function write(filePath: string, content: string) {
  return { tool_name: 'Write', tool_input: { file_path: filePath, content } };
}

function bash(command: string) {
  return { tool_name: 'Bash', tool_input: { command } };
}

describe('decide: file edits', () => {
  it('blocks a key written into a tracked project file, naming the file but not the key', () => {
    const reason = decide(
      write(`${projectDir}/src/config.ts`, `export const key = '${fakeKey}';`),
      env().env,
    );
    expect(reason).toContain('src/config.ts');
    expect(reason).not.toContain(fakeKey);
  });

  it('blocks a key in an Edit, MultiEdit and NotebookEdit', () => {
    const file = `${projectDir}/src/a.ts`;
    const payloads = [
      {
        tool_name: 'Edit',
        tool_input: { file_path: file, old_string: 'x', new_string: fakeKey },
      },
      {
        tool_name: 'MultiEdit',
        tool_input: {
          file_path: file,
          edits: [{ old_string: 'x', new_string: fakeKey }],
        },
      },
      {
        tool_name: 'NotebookEdit',
        tool_input: { notebook_path: file, new_source: fakeKey },
      },
    ];
    for (const payload of payloads)
      expect(decide(payload, env().env)).not.toBeNull();
  });

  it('allows a key written outside the project, such as a shell profile during setup', () => {
    expect(
      decide(
        write('/home/student/.zshrc', `export ANTHROPIC_AUTH_TOKEN=${fakeKey}`),
        env().env,
      ),
    ).toBeNull();
  });

  it('allows a key written into a git-ignored file such as .env', () => {
    const { env: ignoring } = env({
      isIgnored: (path) => path.endsWith('.env'),
    });
    expect(
      decide(
        write(`${projectDir}/.env`, `ANTHROPIC_AUTH_TOKEN=${fakeKey}`),
        ignoring,
      ),
    ).toBeNull();
  });

  it('allows ordinary content', () => {
    expect(
      decide(write(`${projectDir}/src/a.ts`, 'export const a = 1;'), env().env),
    ).toBeNull();
  });
});

describe('decide: git commands', () => {
  it('scans only the staged changes for a plain commit', () => {
    const { env: e, calls } = env();
    expect(decide(bash('git commit -m "Fix collision"'), e)).toBeNull();
    expect(calls).toEqual(['staged']);
  });

  it.each([
    'git add . && git commit -m "x"',
    'git commit -am "x"',
    'git commit --all -m "x"',
  ])(
    'scans the whole working tree when the command also stages: %s',
    (command) => {
      const { env: e, calls } = env();
      decide(bash(command), e);
      expect(calls).toEqual(['working tree']);
    },
  );

  it('blocks a commit when the scan finds something', () => {
    const { env: e } = env({ scanStaged: () => hit });
    expect(decide(bash('git commit -m "x"'), e)).toContain('src/a.ts:3');
  });

  it.each([
    'git push origin main',
    'gh repo create dino --public --source . --push',
  ])('scans the unpushed commits for %s', (command) => {
    const { env: e } = env({ scanUnpushed: () => hit });
    expect(decide(bash(command), e)).toContain('src/a.ts:3');
  });

  it('lets other commands through without scanning, even when they mention a key', () => {
    const { env: e, calls } = env();
    expect(
      decide(
        bash(`echo "export ANTHROPIC_AUTH_TOKEN=${fakeKey}" >> ~/.zshrc`),
        e,
      ),
    ).toBeNull();
    expect(decide(bash('npm test'), e)).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('decide: unexpected input', () => {
  it.each([null, 'text', {}, { tool_name: 'Write' }])(
    'lets %j through',
    (payload) => {
      expect(decide(payload, env().env)).toBeNull();
    },
  );
});

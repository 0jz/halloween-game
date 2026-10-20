// Shared secret scanner for the workshop hooks (see README.md).
//
// Used by block-secrets.mjs (Claude Code PreToolUse), activity-log.mjs
// (redaction) and .githooks/pre-commit (commits made outside Claude), so the
// patterns live in one place. Pattern matching catches known formats, not
// every secret: the goal is stopping accidents.
//
// CLI: `node .claude/hooks/secret-scan.mjs --staged` scans the staged diff,
// prints what it found and exits 1 on a hit.

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {{ readonly name: string, readonly regex: RegExp }} Pattern
 * @typedef {{ readonly pattern: string, readonly file?: string, readonly line?: number }} Finding
 */

/** A line containing this marker is never reported (documented escape hatch). */
export const ALLOW_MARKER = 'secret-scan: allow';

/** @type {readonly Pattern[]} */
export const PATTERNS = [
  // Gateway (LiteLLM), Anthropic and OpenAI style keys.
  { name: 'API key (sk-...)', regex: /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{19,}/g },
  { name: 'AWS access key', regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: 'GitHub token', regex: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g },
  { name: 'private key', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  // A known variable assigned a literal value. `$VAR`, `${{ ... }}` and
  // `<placeholder>` are references, not secrets, and are left alone.
  {
    name: 'token assignment',
    regex:
      /\b(?:ANTHROPIC_AUTH_TOKEN|ANTHROPIC_API_KEY|AWS_SECRET_ACCESS_KEY|GITHUB_TOKEN|GH_TOKEN)\s*[=:]\s*["']?(?![$<{])[^\s"'<>]{12,}/g,
  },
];

/**
 * Names of the patterns found in `text`, one entry per match.
 * @param {string} text
 * @returns {string[]}
 */
export function findSecrets(text) {
  /** @type {string[]} */
  const found = [];
  for (const line of text.split('\n')) {
    if (line.includes(ALLOW_MARKER)) continue;
    for (const { name, regex } of PATTERNS) {
      for (const _ of line.matchAll(regex)) found.push(name);
    }
  }
  return found;
}

/**
 * `text` with every match replaced by `[REDACTED]`.
 * @param {string} text
 * @returns {string}
 */
export function redact(text) {
  return PATTERNS.reduce((out, { regex }) => out.replace(regex, '[REDACTED]'), text);
}

/**
 * Findings in the added lines of a unified diff (`git diff` or `git log -p`).
 * @param {string} diff
 * @returns {Finding[]}
 */
export function scanDiff(diff) {
  /** @type {Finding[]} */
  const findings = [];
  let file = '';
  let line = 0;
  for (const row of diff.split('\n')) {
    if (row.startsWith('+++ ')) {
      file = row.slice(4).replace(/^b\//, '');
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(row);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (row.startsWith('+')) {
      for (const pattern of findSecrets(row.slice(1))) findings.push({ pattern, file, line });
      line += 1;
    } else if (row.startsWith(' ')) {
      line += 1;
    }
  }
  return findings;
}

/**
 * Findings in whole files, for untracked files that a `git add` would pick up.
 * Binary and very large files are skipped.
 * @param {string} cwd
 * @param {readonly string[]} files paths relative to cwd
 * @returns {Finding[]}
 */
export function scanFiles(cwd, files) {
  /** @type {Finding[]} */
  const findings = [];
  for (const file of files) {
    const path = join(cwd, file);
    try {
      if (statSync(path).size > 1_000_000) continue;
      const text = readFileSync(path, 'utf8');
      if (text.includes('\0')) continue;
      text.split('\n').forEach((row, index) => {
        for (const pattern of findSecrets(row)) findings.push({ pattern, file, line: index + 1 });
      });
    } catch {
      // Unreadable files cannot be committed either; nothing to report.
    }
  }
  return findings;
}

/**
 * @param {string} cwd
 * @param {readonly string[]} args
 * @returns {string}
 */
export function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/**
 * @param {string} cwd
 * @param {readonly string[]} args
 * @returns {boolean}
 */
function gitSucceeds(cwd, args) {
  try {
    git(cwd, args);
    return true;
  } catch {
    return false;
  }
}

/**
 * What is staged for the next commit.
 * @param {string} cwd
 * @returns {Finding[]}
 */
export function scanStaged(cwd) {
  return scanDiff(git(cwd, ['diff', '--cached', '--no-color', '--no-ext-diff', '-U0']));
}

/**
 * Everything a `git add . && git commit` or `git commit -a` could commit:
 * staged and unstaged changes to tracked files, plus untracked files that are
 * not ignored.
 * @param {string} cwd
 * @returns {Finding[]}
 */
export function scanWorkingTree(cwd) {
  const base = gitSucceeds(cwd, ['rev-parse', '--verify', 'HEAD']) ? ['HEAD'] : ['--cached'];
  const tracked = scanDiff(git(cwd, ['diff', ...base, '--no-color', '--no-ext-diff', '-U0']));
  const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter(Boolean);
  return [...tracked, ...scanFiles(cwd, untracked)];
}

/**
 * The commits a `git push` of the current branch would send: everything after
 * its upstream, or everything not on any remote yet.
 * @param {string} cwd
 * @returns {Finding[]}
 */
export function scanUnpushed(cwd) {
  const range = gitSucceeds(cwd, ['rev-parse', '--abbrev-ref', '@{upstream}'])
    ? ['@{upstream}..HEAD']
    : ['HEAD', '--not', '--remotes'];
  return scanDiff(git(cwd, ['log', '-p', '--no-color', '--no-ext-diff', '-U0', '--format=', ...range]));
}

/**
 * Human-readable report. Never repeats the secret itself.
 * @param {readonly Finding[]} findings
 * @returns {string}
 */
export function describe(findings) {
  const rows = findings.map(({ pattern, file, line }) =>
    `  - ${pattern}${file ? ` in ${file}${line ? `:${String(line)}` : ''}` : ''}`,
  );
  return [...new Set(rows)].join('\n');
}

/** Advice shared by every blocking message. */
export const ADVICE = [
  'Keys belong in environment variables (ANTHROPIC_AUTH_TOKEN), never in a file in the repository.',
  'Remove the value, or move it to a git-ignored file such as .env.',
  `If it is a false positive, add the comment "${ALLOW_MARKER}" on that line.`,
].join('\n');

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href && process.argv.includes('--staged')) {
  try {
    const findings = scanStaged(process.cwd());
    if (findings.length > 0) {
      process.stderr.write(
        `Commit blocked: this looks like a secret.\n${describe(findings)}\n\n${ADVICE}\n`,
      );
      process.exit(1);
    }
  } catch {
    // Not a git repository or git missing: never stand in the way of a commit.
  }
}

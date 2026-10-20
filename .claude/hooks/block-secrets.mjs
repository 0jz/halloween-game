// Claude Code PreToolUse hook: stops secrets before they reach the repository
// (see "Your activity log" in README.md).
//
// Write, Edit, MultiEdit, NotebookEdit: the new content is scanned, unless the
// file is outside the project (e.g. ~/.zshrc during setup) or git-ignored
// (e.g. .env). Bash: `git commit` scans what the commit could contain,
// `git push` (and `gh repo create --push`) scans the commits not pushed yet.
//
// A hit exits 2, which blocks the tool call and hands stderr to Claude as the
// reason. Anything unexpected exits 0: this hook prevents accidents, it never
// breaks a session.

import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ADVICE,
  describe,
  findSecrets,
  git,
  scanStaged,
  scanUnpushed,
  scanWorkingTree,
} from './secret-scan.mjs';

/**
 * @typedef {import('./secret-scan.mjs').Finding} Finding
 * @typedef {{
 *   readonly projectDir: string,
 *   readonly isIgnored: (absolutePath: string) => boolean,
 *   readonly scanStaged: () => Finding[],
 *   readonly scanWorkingTree: () => Finding[],
 *   readonly scanUnpushed: () => Finding[],
 * }} Env
 */

/** Matches `git commit`, allowing options such as `git -C dir commit`. */
const GIT_COMMIT = /\bgit\b[^;&|\n]*?\bcommit\b/;
/** `-a`, `-am`, `--all`: the commit takes unstaged changes too. */
const COMMIT_ALL = /\bcommit\b[^;&|\n]*?\s(?:-[A-Za-z]*a[A-Za-z]*|--all)\b/;
const GIT_ADD = /\bgit\b[^;&|\n]*?\badd\b/;
const GIT_PUSH = /\bgit\b[^;&|\n]*?\bpush\b|\bgh\s+repo\s+create\b[^;&|\n]*--push\b/;

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

/**
 * @param {Record<string, unknown>} input
 * @param {string} key
 * @returns {string}
 */
function text(input, key) {
  const value = input[key];
  return typeof value === 'string' ? value : '';
}

/**
 * The new text a file-editing tool would write.
 * @param {string} tool
 * @param {Record<string, unknown>} input
 * @returns {string}
 */
function newContent(tool, input) {
  switch (tool) {
    case 'Write':
      return text(input, 'content');
    case 'Edit':
      return text(input, 'new_string');
    case 'NotebookEdit':
      return text(input, 'new_source');
    case 'MultiEdit': {
      const edits = input['edits'];
      return Array.isArray(edits)
        ? edits.map((edit) => (isRecord(edit) ? text(edit, 'new_string') : '')).join('\n')
        : '';
    }
    default:
      return '';
  }
}

/**
 * The blocking reason for a PreToolUse payload, or null to let it through.
 * @param {unknown} payload
 * @param {Env} env
 * @returns {string | null}
 */
export function decide(payload, env) {
  if (!isRecord(payload) || !isRecord(payload['tool_input'])) return null;
  const tool = text(payload, 'tool_name');
  const input = payload['tool_input'];

  if (tool === 'Bash') {
    const command = text(input, 'command');
    if (GIT_COMMIT.test(command)) {
      const broad = GIT_ADD.test(command) || COMMIT_ALL.test(command);
      const findings = broad ? env.scanWorkingTree() : env.scanStaged();
      if (findings.length > 0) {
        return `Blocked: this commit would include what looks like a secret.\n${describe(findings)}\n\n${ADVICE}`;
      }
    }
    if (GIT_PUSH.test(command)) {
      const findings = env.scanUnpushed();
      if (findings.length > 0) {
        return `Blocked: the commits being pushed contain what looks like a secret. Remove it from the history before pushing (the repository is public).\n${describe(findings)}\n\n${ADVICE}`;
      }
    }
    return null;
  }

  const content = newContent(tool, input);
  if (!content) return null;
  const path = text(input, 'file_path') || text(input, 'notebook_path');
  const absolute = resolve(env.projectDir, path);
  const inside = relative(env.projectDir, absolute);
  if (inside.startsWith('..') || isAbsolute(inside)) return null;
  if (env.isIgnored(absolute)) return null;

  const findings = findSecrets(content);
  if (findings.length === 0) return null;
  const rows = describe(findings.map((pattern) => ({ pattern, file: inside })));
  return `Blocked: writing what looks like a secret into a file git would commit.\n${rows}\n\n${ADVICE}`;
}

/**
 * @param {string} projectDir
 * @returns {Env}
 */
function realEnv(projectDir) {
  return {
    projectDir,
    isIgnored: (absolutePath) => {
      try {
        git(projectDir, ['check-ignore', '-q', absolutePath]);
        return true;
      } catch {
        return false;
      }
    },
    scanStaged: () => scanStaged(projectDir),
    scanWorkingTree: () => scanWorkingTree(projectDir),
    scanUnpushed: () => scanUnpushed(projectDir),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    /** @type {unknown} */
    const payload = JSON.parse(readFileSync(0, 'utf8'));
    const cwd = isRecord(payload) ? text(payload, 'cwd') : '';
    const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? (cwd || process.cwd());
    const reason = decide(payload, realEnv(projectDir));
    if (reason) {
      process.stderr.write(`${reason}\n`);
      process.exit(2);
    }
  } catch {
    // Fail open: a broken hook must not block the student's session.
  }
}

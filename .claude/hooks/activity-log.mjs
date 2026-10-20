// Claude Code hook: appends one JSON line per event to .workshop/activity.jsonl
// (see "Your activity log" in README.md).
//
// The log is the student's own history of the session (read it with
// /activity) and the evidence for the process steps of the judging. It is
// written by Claude Code, not by the model, so it is complete whatever the
// model does.
//
// Recorded: timestamp, session, event, tool name, file path, a truncated Bash
// command, subagent type, skill name, slash command, permission mode and the
// prompt truncated to PROMPT_LIMIT characters. Never file contents and never
// model output. Secret-like strings are redacted. Each line carries `prev`,
// the SHA-256 of the line before it, so edits to the log are detectable.
// Failures are silent: the hook never breaks a session.

import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { redact } from './secret-scan.mjs';

/** @typedef {Record<string, string | boolean>} Entry */

export const LOG_PATH = '.workshop/activity.jsonl';
export const PROMPT_LIMIT = 500;
export const COMMAND_LIMIT = 200;

/** Prompts Claude Code injects itself (background-task results) start with this. */
const NOTIFICATION_PREFIX = '<task-notification>';

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

/**
 * @param {unknown} record
 * @param {string} key
 * @returns {string}
 */
function text(record, key) {
  if (!isRecord(record)) return '';
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

/**
 * @param {string} value
 * @param {number} limit
 * @returns {string}
 */
function truncate(value, limit) {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

/**
 * A path relative to the project when it is inside it.
 * @param {string} path
 * @param {string} projectDir
 * @returns {string}
 */
function projectPath(path, projectDir) {
  const inside = relative(projectDir, path);
  return inside && !inside.startsWith('..') && !isAbsolute(inside) ? inside : path;
}

/**
 * The log entry for a hook payload, without `prev`; null if there is nothing
 * to record.
 * @param {unknown} payload
 * @param {{ readonly now: Date, readonly projectDir: string }} context
 * @returns {Entry | null}
 */
export function toEntry(payload, { now, projectDir }) {
  const event = text(payload, 'hook_event_name');
  if (!event) return null;
  /** @type {Entry} */
  const entry = { ts: now.toISOString(), session: text(payload, 'session_id'), event };

  switch (event) {
    case 'SessionStart': {
      const source = text(payload, 'source');
      if (source) entry['source'] = source;
      break;
    }
    case 'UserPromptSubmit': {
      const prompt = text(payload, 'prompt');
      const mode = text(payload, 'permission_mode');
      if (mode) entry['mode'] = mode;
      if (prompt.startsWith(NOTIFICATION_PREFIX)) {
        // Carries a subagent's output, which the log never records.
        entry['notification'] = true;
        break;
      }
      const command = /^\/[\w:.-]+/.exec(prompt.trimStart());
      if (command) entry['command'] = command[0];
      entry['prompt'] = truncate(prompt, PROMPT_LIMIT);
      break;
    }
    case 'PostToolUse': {
      const tool = text(payload, 'tool_name');
      const input = isRecord(payload) ? payload['tool_input'] : undefined;
      entry['tool'] = tool;
      const file = text(input, 'file_path') || text(input, 'notebook_path');
      if (file) entry['file'] = projectPath(file, projectDir);
      if (tool === 'Bash') entry['cmd'] = truncate(text(input, 'command'), COMMAND_LIMIT);
      if (tool === 'Agent' || tool === 'Task') {
        entry['agent'] = text(input, 'subagent_type') || 'general-purpose';
      }
      if (tool === 'Skill') entry['skill'] = text(input, 'skill');
      break;
    }
    case 'SubagentStop':
      entry['agent'] = text(payload, 'agent_type');
      break;
    case 'SessionEnd': {
      const reason = text(payload, 'reason');
      if (reason) entry['reason'] = reason;
      break;
    }
    default:
      // Stop and any other event: the event name and time are the record.
      break;
  }

  for (const [key, value] of Object.entries(entry)) {
    if (typeof value === 'string') entry[key] = redact(value);
  }
  return entry;
}

/**
 * @param {string} line
 * @returns {string}
 */
export function hashLine(line) {
  return createHash('sha256').update(line).digest('hex');
}

/**
 * The serialised line for `entry`, chained to the last line of `existing`.
 * @param {string} existing current file contents
 * @param {Entry} entry
 * @returns {string}
 */
export function chainLine(existing, entry) {
  const lines = existing.split('\n').filter(Boolean);
  const last = lines.at(-1);
  return JSON.stringify({ ...entry, prev: last === undefined ? null : hashLine(last) });
}

/**
 * Index of the first line whose `prev` does not match, or -1 if intact.
 * @param {string} contents
 * @returns {number}
 */
export function brokenAt(contents) {
  const lines = contents.split('\n').filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const previous = lines[i - 1];
    try {
      /** @type {unknown} */
      const parsed = JSON.parse(line);
      const prev = isRecord(parsed) ? parsed['prev'] : undefined;
      const expected = previous === undefined ? null : hashLine(previous);
      if (prev !== expected) return i;
    } catch {
      return i;
    }
  }
  return -1;
}

/**
 * Runs `action` holding a lock directory, so hooks fired in parallel (parallel
 * tool calls, subagents) cannot interleave and break the chain.
 * @param {string} lockDir
 * @param {() => void} action
 */
function withLock(lockDir, action) {
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      mkdirSync(lockDir);
    } catch {
      try {
        // A lock older than five seconds belongs to a hook that died.
        if (Date.now() - statSync(lockDir).mtimeMs > 5000) rmdirSync(lockDir);
      } catch {
        // Released in the meantime.
      }
      Atomics.wait(pause, 0, 0, 10);
      continue;
    }
    try {
      action();
    } finally {
      rmdirSync(lockDir);
    }
    return;
  }
}

/**
 * Appends `entry` to the log under `projectDir`.
 * @param {string} projectDir
 * @param {Entry} entry
 */
export function appendEntry(projectDir, entry) {
  const file = join(projectDir, LOG_PATH);
  mkdirSync(dirname(file), { recursive: true });
  withLock(`${file}.lock`, () => {
    const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
    appendFileSync(file, `${chainLine(existing, entry)}\n`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    /** @type {unknown} */
    const payload = JSON.parse(readFileSync(0, 'utf8'));
    const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? (text(payload, 'cwd') || process.cwd());
    const entry = toEntry(payload, { now: new Date(), projectDir });
    if (entry) appendEntry(projectDir, entry);
  } catch {
    // Silent by design.
  }
}

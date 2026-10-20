// Prints .workshop/activity.jsonl as a readable timeline, grouped by session,
// and says whether the hash chain is intact. Behind the /activity command and
// `npm run activity`.
//
// `--all` also shows read-only tools (Read, Grep, Glob, ...), hidden by default
// because they drown out prompts and edits.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LOG_PATH, brokenAt } from './activity-log.mjs';

/** Tools that only look around; hidden unless `--all`. */
const QUIET_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'ToolSearch', 'TodoWrite', 'TaskList', 'TaskGet']);
const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

/**
 * @param {Record<string, unknown>} entry
 * @param {string} key
 * @returns {string}
 */
function text(entry, key) {
  const value = entry[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Label and detail for one entry, or null to skip it.
 * @param {Record<string, unknown>} entry
 * @param {boolean} all
 * @returns {readonly [string, string] | null}
 */
function describeEntry(entry, all) {
  switch (text(entry, 'event')) {
    case 'UserPromptSubmit': {
      if (entry['notification'] === true) return null;
      const mode = text(entry, 'mode') === 'plan' ? ' (plan mode)' : '';
      return ['you', `${text(entry, 'prompt').replace(/\s+/g, ' ')}${mode}`];
    }
    case 'PostToolUse': {
      const tool = text(entry, 'tool');
      if (!all && QUIET_TOOLS.has(tool)) return null;
      if (tool === 'ExitPlanMode') return ['plan', 'plan approved, leaving plan mode'];
      if (tool === 'EnterPlanMode') return ['plan', 'entered plan mode'];
      if (tool === 'Bash') return ['bash', text(entry, 'cmd')];
      if (EDIT_TOOLS.has(tool)) return ['edit', text(entry, 'file')];
      if (tool === 'Agent' || tool === 'Task') return ['agent', `started ${text(entry, 'agent')}`];
      if (tool === 'Skill') return ['skill', text(entry, 'skill')];
      if (tool.startsWith('mcp__')) return ['mcp', tool.slice('mcp__'.length).replace('__', ' → ')];
      const file = text(entry, 'file');
      return ['tool', file ? `${tool} ${file}` : tool];
    }
    case 'SubagentStop':
      return ['agent', `${text(entry, 'agent')} finished`];
    case 'Stop':
      return ['claude', 'finished answering'];
    case 'SessionEnd':
      return ['end', `session ended${text(entry, 'reason') ? ` (${text(entry, 'reason')})` : ''}`];
    default:
      return null;
  }
}

/**
 * The timeline for the log's contents.
 * @param {string} contents
 * @param {{ readonly all?: boolean, readonly timeZone?: string }} [options]
 * @returns {string}
 */
export function formatTimeline(contents, options = {}) {
  const all = options.all ?? false;
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  });
  const day = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
  });

  /** @type {string[]} */
  const out = [];
  let session = '';
  let count = 0;
  for (const line of contents.split('\n').filter(Boolean)) {
    /** @type {unknown} */
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;
    count += 1;
    const when = new Date(text(parsed, 'ts'));
    if (Number.isNaN(when.getTime())) continue;
    if (text(parsed, 'session') !== session) {
      session = text(parsed, 'session');
      if (out.length > 0) out.push('');
      out.push(`Session ${session.slice(0, 8)}, ${day.format(when)} ${time.format(when).slice(0, 5)}`);
    }
    const described = describeEntry(parsed, all);
    if (!described) continue;
    const [label, detail] = described;
    out.push(`  ${time.format(when)}  ${label.padEnd(6)} ${detail}`);
  }

  if (count === 0) return 'The activity log is empty: nothing has been recorded yet.';
  const broken = brokenAt(contents);
  out.push('');
  out.push(
    broken === -1
      ? `Log chain intact (${String(count)} entries).`
      : `Log chain broken at entry ${String(broken + 1)}: the log was changed after it was written.`,
  );
  return out.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = join(process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd(), LOG_PATH);
  const contents = existsSync(file) ? readFileSync(file, 'utf8') : '';
  process.stdout.write(`${formatTimeline(contents, { all: process.argv.includes('--all') })}\n`);
}

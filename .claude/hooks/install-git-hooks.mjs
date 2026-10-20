// Run by `npm install` (the `prepare` script): points git at .githooks/ so the
// pre-commit secret scan also covers commits made outside Claude Code. Git does
// not copy hooks on clone, which is why this step exists. Silent when this is
// not a git checkout (a tarball, a CI cache) or git is missing.

import { execFileSync } from 'node:child_process';

try {
  execFileSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' });
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' });
} catch {
  // Nothing to install.
}

---
description: Show your session history (prompts, plan mode, tools, files changed) from the activity log
argument-hint: '[a question about your session]'
allowed-tools: Bash(node .claude/hooks/activity-report.mjs:*)
---

This is the student's activity timeline, printed from `.workshop/activity.jsonl` by `.claude/hooks/activity-report.mjs` (read-only tools such as Read and Grep are hidden; `npm run activity -- --all` in a terminal shows them too):

!`node .claude/hooks/activity-report.mjs`

Question from the student, if any: $ARGUMENTS

If there is no question, show the timeline above exactly as printed, in a code block, and add nothing except one line saying whether the log chain is intact.

If there is a question ("what did I ask before the plan?", "which files did I change for the collision fix?"), answer it from the timeline only, quoting the times of the entries you rely on. If the timeline does not answer it, say so; do not guess.

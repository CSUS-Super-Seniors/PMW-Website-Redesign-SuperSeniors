#!/usr/bin/env node
'use strict';

/*
 * PreToolUse hook for the "Agent" tool. Deterministic, independent backstop for
 * SKILL.md step 2's behavioral checkout-safety check: blocks dispatch of any
 * review-council specialist when the current checkout's governance files
 * (CLAUDE.md, AGENTS.md, etc.) differ from the repository's own default branch,
 * since Claude Code auto-injects those files into every custom subagent's
 * context with no per-agent opt-out. See skills/review-council/TRUST_MODEL.md.
 *
 * This script must not trust anything the orchestrator session tells it about
 * which base revision is "correct" - the orchestrator may itself be running
 * inside an already-compromised context, which is exactly the scenario this
 * hook exists to catch independently of. It derives its own trusted reference
 * (the git remote's default branch) instead.
 *
 * Policy once a call is confirmed to be a review-council specialist dispatch:
 * fail CLOSED, not open. If this guard cannot positively verify the checkout
 * is clean (missing cwd, unresolvable repo root, unresolvable trusted ref, a
 * failing git command), that is treated the same as finding a difference -
 * deny, and tell the human how to proceed deliberately. Fail-open is reserved
 * for calls this guard has no basis to even recognize as ours (unparseable
 * hook input, or an agent that isn't one of the six specialists) - those are
 * out of scope for this hook, not evaluation failures within scope.
 *
 * Never call process.exit() after writing to stdout here - on some platforms
 * that can truncate a pipe write before it flushes. Set process.exitCode and
 * let the event loop drain naturally instead.
 */

const fs = require('fs');
const { execFileSync } = require('child_process');

// Top-anchored, recursive: matches at any depth, regardless of the hook's cwd.
const GOVERNANCE_PATHSPECS = [
  ':(top,glob)**/CLAUDE.md',
  ':(top,glob)**/CLAUDE.local.md',
  ':(top,glob)**/AGENTS.md',
  ':(top,glob).claude/**',
  ':(top,glob).github/workflows/**',
];

// Plugin install: scoped identifier "review-council:<name>". Project-local
// install (agents copied into .claude/agents/ or a user's ~/.claude/agents/):
// bare frontmatter `name`, no prefix at all - see the "Install-mode caveat"
// note in TRUST_MODEL.md for why this hook still won't fire in that mode
// even with this broadened match (hooks/hooks.json isn't auto-discovered
// outside a plugin install; this match is here for anyone who wires this
// script into .claude/settings.json manually).
const KNOWN_AGENT_NAMES = [
  'correctness-reviewer',
  'security-reviewer',
  'policy-boundary-reviewer',
  'test-evidence-reviewer',
  'architecture-reviewer',
  'interface-reviewer',
];
const AGENT_NAME_FIELDS = ['subagent_type', 'agent_type', 'agent_name', 'name'];

function readStdin() {
  const chunks = [];
  const buf = Buffer.alloc(65536);
  try {
    let bytes;
    while ((bytes = fs.readSync(0, buf, 0, buf.length)) > 0) {
      chunks.push(Buffer.from(buf.subarray(0, bytes)));
    }
  } catch (e) {
    // EAGAIN/EOF on some platforms when stdin is a closed/empty pipe - use what we have
  }
  return Buffer.concat(chunks).toString('utf8');
}

function allow() {
  process.exitCode = 0;
}

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exitCode = 0; // exit 0 + JSON is how PreToolUse reads a decision; exit 2 would be a different (error) path
}

function denyEvaluationFailure(detail) {
  return deny(
    `review-council checkout guard could not verify this checkout is safe (${detail}). ` +
    `Rather than dispatch a specialist without that verification, this is treated as a deny. ` +
    `Fix the underlying issue, or set REVIEW_COUNCIL_ALLOW_UNTRUSTED_CHECKOUT=1 to proceed deliberately.`
  );
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function resolveRepoRoot(cwd) {
  return git(cwd, ['rev-parse', '--show-toplevel']);
}

function resolveTrustedRef(repoRoot) {
  try {
    return git(repoRoot, ['rev-parse', '--abbrev-ref', 'refs/remotes/origin/HEAD']);
  } catch (e) {
    for (const candidate of ['origin/main', 'origin/master']) {
      try {
        git(repoRoot, ['rev-parse', '--verify', candidate]);
        return candidate;
      } catch (e2) {
        // try next candidate
      }
    }
  }
  return null;
}

function changedGovernancePaths(repoRoot, trustedRef) {
  const tracked = git(repoRoot, ['diff', '--name-only', trustedRef, '--', ...GOVERNANCE_PATHSPECS]);
  const untracked = git(repoRoot, ['ls-files', '--others', '--exclude-standard', '--', ...GOVERNANCE_PATHSPECS]);
  const combined = new Set([
    ...tracked.split('\n').filter(Boolean),
    ...untracked.split('\n').filter(Boolean),
  ]);
  return [...combined];
}

function identifyAgent(toolInput) {
  for (const field of AGENT_NAME_FIELDS) {
    const value = toolInput[field];
    if (typeof value !== 'string') continue;
    if (value.startsWith('review-council:')) return value;
    const bare = value.includes(':') ? value.split(':').pop() : value;
    if (KNOWN_AGENT_NAMES.includes(bare)) return value;
  }
  return null; // not recognizably one of ours
}

function main() {
  let input;
  try {
    input = JSON.parse(readStdin());
  } catch (e) {
    return allow(); // can't parse hook input at all - out of scope, not an evaluation failure
  }

  if (input.tool_name !== 'Agent') return allow();

  const agentId = identifyAgent(input.tool_input || {});
  if (agentId === null) return allow(); // not one of our six specialists - out of scope

  // Everything below this point knows it's a review-council specialist dispatch.
  // From here, failure to positively verify safety denies rather than allows.

  if (process.env.REVIEW_COUNCIL_ALLOW_UNTRUSTED_CHECKOUT === '1') {
    process.stderr.write('review-council checkout guard: bypassed via REVIEW_COUNCIL_ALLOW_UNTRUSTED_CHECKOUT=1\n');
    return allow();
  }

  const cwd = input.cwd;
  if (!cwd) return denyEvaluationFailure('hook input had no cwd');

  let repoRoot;
  try {
    repoRoot = resolveRepoRoot(cwd);
  } catch (e) {
    return denyEvaluationFailure('not a git repository, or git is unavailable');
  }

  const trustedRef = resolveTrustedRef(repoRoot);
  if (!trustedRef) {
    return denyEvaluationFailure('could not resolve origin/HEAD, origin/main, or origin/master as a trusted reference');
  }

  let changed;
  try {
    changed = changedGovernancePaths(repoRoot, trustedRef);
  } catch (e) {
    return denyEvaluationFailure('git diff/ls-files failed while checking governance files');
  }

  if (changed.length === 0) return allow();

  return deny(
    `Checkout differs from ${trustedRef} on governance file(s): ${changed.join(', ')} (tracked or untracked, at any depth). ` +
    `Review Council refuses to dispatch specialists from this checkout, since Claude Code auto-injects these files into every custom subagent's context with no per-agent opt-out. ` +
    `Review from a clean checkout of the trusted base (e.g. \`git worktree add ../review-base ${trustedRef}\`) or without checking out the branch locally (let gh pr diff / git show fetch reviewed content remotely instead). ` +
    `Set REVIEW_COUNCIL_ALLOW_UNTRUSTED_CHECKOUT=1 to bypass deliberately, e.g. for a repository's own legitimate CLAUDE.md changes on a long-lived feature branch.`
  );
}

main();

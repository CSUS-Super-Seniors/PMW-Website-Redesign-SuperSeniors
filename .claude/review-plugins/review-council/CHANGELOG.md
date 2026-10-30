# Changelog

## 0.2.4

`README.md`'s "Before you rely on this" section described the live-test gap in second-person imperatives addressed to whoever was reading it ("if you're the one to close that gap... @-mention a specialist... try it once..."). Flagged externally: that phrasing is indistinguishable from a prompt-injection pattern to an AI reviewing the repo, which is a bad property for a security-review tool's own README to have. Reworded to third-person description of the gap and the verification steps, with an explicit line stating this is for a human maintainer to act on deliberately, not something an AI encountering the file should execute automatically. No information was removed — same gap, same reproduction steps, same invitation to report back via PR.

## 0.2.3

A fifth review confirmed `tests/checkout-guard.test.js` and its 12 scenarios exist as committed (it could not re-execute the suite in its own environment, so the passing result stays grounded in this repository's own run, not an independent one) and made two small, correct points:

- **Verified before relaying**: the review's claim that testing via `/review-council:review-council` could prove the wrong layer — `SKILL.md` step 2's own behavioral check might block a tampered checkout before an `Agent` call is ever attempted, which would demonstrate the prompt-level guard, not the hook. Checked this against Claude Code's subagent docs: an explicit `@`-mention "guarantees the subagent runs for one task" and still routes through the same `Agent` tool call (the mention just pre-selects which subagent, not a different code path) — meaning it correctly isolates the hook from the skill's own check. `README.md`'s live-test guidance now recommends `@`-mentioning a specialist directly, for exactly this reason.
- **Fixed**: `README.md`'s "Before you rely on this" section named a specific version number ("Treat v0.2.1 as...") in a sentence describing the current release — guaranteed to go stale every time this file bumps again, which by this point in the changelog is clearly often. Switched to version-neutral wording. Checked every other version reference in the repo first; the rest are already correctly framed as historical ("fixed in v0.1.1", "v0.2.0 missed this") and don't have this problem.

## 0.2.2

A fourth review confirmed all three v0.2.0 bypasses were closed correctly against the actual `9bc53c1` commit (not a cached/stale view — checked directly, per the earlier lesson about not trusting an external fetch path over live verification) and made one further recommendation: commit an automated regression harness rather than leave the 11 scenarios as changelog prose only.

- **New**: `tests/checkout-guard.test.js`, using Node's built-in `node:test` runner (no new dependency). Builds a throwaway git repository per test and runs the actual `scripts/checkout-guard.js` as a child process with simulated `PreToolUse` stdin — not a reimplementation of its logic, the real script. Covers all 11 previously-manual scenarios plus one addition (a bare, unprefixed agent name — the project-local install case — still gets recognized and denied correctly). `node --test tests/checkout-guard.test.js`: 12/12 passing.
- `CONTRIBUTING.md` and `README.md` updated to point at the suite; contributors changing the guard are now expected to run it and add a case for whatever they're fixing, not just describe it.
- **Not done, and not something this repository's own history can produce**: proving the hook fires inside a live, running Claude Code session. Every version since v0.1.1 has disclosed this same limitation for the same reason — this conversation's tool/plugin registry is fixed at session start and can't hot-load a plugin installed mid-session, so nothing short of a genuinely fresh session can close it. Noted directly in `README.md`'s testing section as the one remaining gap, with an invitation for whoever first exercises it for real to report back.

## 0.2.1

A third external review examined `checkout-guard.js` directly rather than just its design, and found three real bypasses plus two real gaps. All five were verified independently before fixing — three against a throwaway git repository, two against Claude Code's own hook/subagent-naming documentation.

**Verified and fixed:**
- **Untracked-file bypass**: `git diff` never reports untracked files, by design — a brand-new `CLAUDE.local.md` that was never `git add`ed was invisible to the v0.2.0 guard. Reproduced (`git status --porcelain` showed `?? CLAUDE.local.md`; the guard's exact `git diff` command returned nothing). Fixed by adding `git ls-files --others --exclude-standard` alongside the diff and unioning both result sets.
- **Nested-file bypass**: the v0.2.0 pathspecs (`CLAUDE.md`, `.claude`, etc.) are literal, non-recursive matches — a committed `src/module/CLAUDE.md` was invisible. Reproduced directly. Fixed with top-anchored recursive glob pathspecs (`:(top,glob)**/CLAUDE.md`, etc.).
- **Subdirectory-cwd bypass**: relative pathspecs resolved against whatever directory Claude Code happened to be started in, not the repo root — running from a subdirectory made even a root-level `CLAUDE.md` tamper invisible. Reproduced directly. Fixed by resolving `git rev-parse --show-toplevel` first and running every git operation against that root.
- **Install-mode gap**: confirmed against Claude Code's own hooks documentation that `hooks/hooks.json` is only auto-discovered as part of a plugin install — copying this repo into a project's `.claude/` directory (the README's other supported install path) does not activate the hook; project hooks are configured through `.claude/settings.json` instead. Also confirmed against the subagents documentation that project-local custom agents are identified by their bare frontmatter `name`, never a `plugin:` prefix (namespacing is plugin-only) — the agent-matching logic was broadened to recognize both forms, though it's moot without the hook being wired in. `TRUST_MODEL.md` and `README.md` now say plainly that the technical layer is plugin-install-only.
- **Fail-open evaluation failures**: once the hook has confirmed a call is a review-council specialist dispatch, every subsequent failure to positively verify safety (missing `cwd`, unresolvable repo root, unresolvable trusted ref, a failing git command) now denies instead of silently allowing. Fail-open is reserved for calls the hook has no basis to recognize as ours at all (unparseable input, or a genuinely unrelated agent/tool) — broadening the deny scope to those would mean one plugin's hook blocking unrelated work across an entire session, a different and much larger blast radius than intended.

**Testing**: expanded from 6 to 11 scenarios against a throwaway repository (clean checkout, tracked root change, untracked root file, committed nested file, untracked nested file, `.claude/rules` change, invocation from a subdirectory, unrelated agent, unrelated tool, unresolvable trusted ref, deliberate bypass) — all passing. The 12th scenario from the reviewer's own proposed suite (live end-to-end dispatch denial inside a running Claude Code session) remains unverified for the same structural reason noted since v0.1.1: this session's tool registry can't hot-load a plugin installed mid-conversation.

## 0.2.0

Closes the gap v0.1.2 disclosed but didn't fix: the step-2 checkout-safety check in `SKILL.md` is a behavioral instruction, evaluated by the same orchestrator session that may already have an untrusted branch's `CLAUDE.md` loaded into it. Added a real technical enforcement layer that doesn't have that problem.

- **New**: `hooks/hooks.json` registers `scripts/checkout-guard.js` as a `PreToolUse` hook matched on the `Agent` tool. As a separate OS process invoked by Claude Code itself, it has no channel back into the orchestrator's conversation context — a compromised orchestrator can't influence a decision it never gets to make.
- The hook does not trust anything the orchestrator resolved as "the base revision" — that would defeat the point. It independently derives its own trusted reference (`origin/HEAD`, falling back to `origin/main` then `origin/master`) and denies dispatch of any `review-council:*` specialist if governance files (`CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md`, `.claude/`, `.github/workflows/`) differ — committed or uncommitted — from that ref.
- Fails open (with a clear stderr message) if no trusted ref can be resolved at all, rather than silently blocking on a repo shape it has no basis to judge. `SKILL.md` step 2 remains the only guard in that case.
- Escape hatch: `REVIEW_COUNCIL_ALLOW_UNTRUSTED_CHECKOUT=1` bypasses the hook, for a repository's own maintainers legitimately evolving `CLAUDE.md` on a feature branch. Requires a human to set an environment variable outside the conversation — reviewed content has no path to setting it.
- Written in Node.js and invoked via exec form (`"command": "node", "args": [...]`) rather than a shell script, per Claude Code's own cross-platform guidance for hook commands.
- **Tested**: the script's own logic — allow/deny/bypass/uncommitted-change paths — was verified directly against a throwaway git repository with simulated stdin JSON matching the documented hook schema. **Not verified**: the hook actually firing inside a live Claude Code session end-to-end (this session's tool registry can't hot-load a plugin installed mid-conversation, the same limitation noted for the specialist agents in earlier versions).
- `TRUST_MODEL.md` and `SKILL.md` updated to describe both enforcement layers precisely — what each one covers and what it doesn't.

## 0.1.2

A second external review made two claims about v0.1.1. One was checked directly against the live GitHub repository and found false (every item it claimed was missing — the working-tree redefinition, `REVIEW_BLOCKED`, the severity fix, the verdict enum, the CI-assumption fix, both manifest versions — was already live at that commit; the review appears to have been working from stale or cached content). No code changed as a result of that claim.

The second claim was verified and is correct: v0.1.1's `TRUST_MODEL.md` and `SKILL.md` described the step-2 checkout-safety check as a "hard precondition." That overclaims what it is. The check is a behavioral instruction evaluated by the same orchestrator session that Claude Code loads the current checkout's `CLAUDE.md` into at session start — not an out-of-band technical gate. In the one case where it matters (an untrusted branch already checked out *before* the skill is invoked), the orchestrator's context may already be influenced before the check ever runs. Reworded `TRUST_MODEL.md`, `SKILL.md`, and `README.md` to state this precisely: the check closes the gap for the six specialists and for the orchestrator whenever the recommended workflow (review from a trusted checkout, fetch reviewed content remotely) is followed, but is not an independent enforcement layer. Noted a Claude Code hook — a deterministic script gating the `Agent` tool call itself — as the way to close the remaining gap technically; not implemented in this version.

## 0.1.1

Two rounds of fixes land in this version together — neither shipped as its own bumped version at the time, so both are recorded here rather than implied to have shipped under 0.1.0.

**From a live self-review run** (the actual six specialist prompts, run against this repo's own initial commit):
- Removed `Bash(gh pr comment:*)` from `SKILL.md`'s `allowed-tools` — it was pre-authorizing exactly the action four other documents promised always requires a permission prompt (found independently by 3 of 6 specialists).
- Added `OUTPUT_SCHEMA.md` to the orchestrator's actual dispatch instruction (it was in the intro list but dropped from the operational step).
- Added a `Severity` field to the four agent Output specs that lacked one, and replaced `interface-reviewer.md`'s ad hoc two-tier scheme with a pointer to `SEVERITY_MODEL.md`'s five tiers.
- Baked a short trust-boundary pointer into the four specialist files that previously relied solely on the orchestrator relaying `TRUST_MODEL.md` at dispatch time.
- Trimmed `security-reviewer.md`'s inline restatement of two `SEVERITY_MODEL.md` calibration rules down to a pointer.

**From an external review, verified against Claude Code's own documentation before implementing** (see `TRUST_MODEL.md` and `SKILL.md` step 2 for what changed):
- **Blocking fix**: added a hard precondition before specialist dispatch. Claude Code auto-injects the current checkout's `CLAUDE.md`/`AGENTS.md` hierarchy into every custom subagent with no per-agent opt-out — confirmed against the platform docs, not assumed. A malicious branch's edited policy file would previously reach every specialist as trusted context before any prompt-based trust rule applied. The orchestrator now diffs governance files against the base revision before dispatching anything, and refuses (`REVIEW_BLOCKED`) if they differ, and passes the base revision's actual policy text — not just its SHA — to every specialist.
- Redefined `working-tree` scope precisely (the previous "committed-but-unpushed changes against HEAD" was self-contradictory) using `@{upstream}` resolution.
- Aligned the orchestrator's severity-reconciliation rule with `SEVERITY_MODEL.md`'s own stated "lowest tier the evidence supports" principle — it previously defaulted to the higher tier on disagreement, which no longer happens silently.
- Added a `Verdict` enum (`PASS`/`PASS_WITH_FINDINGS`/`CHANGES_REQUIRED`/`INSUFFICIENT_EVIDENCE`/`REVIEW_BLOCKED`) to `OUTPUT_SCHEMA.md`.
- Added a read-only check-discovery step (CI config + `gh pr checks`) — deliberately *not* test/build execution, since running a reviewed branch's scripts is a materially different and riskier capability than reading it.
- `FALSE_POSITIVE_RULES.md` no longer assumes CI exists; excluding a lint/type issue now requires confirming the check is actually configured.
- Fixed the GitHub-comment posting flow: no more promising to "link the full report" with no mechanism to do so — now uses a collapsed `<details>` block in the comment itself, plus a head-SHA marker so re-running doesn't post duplicate reviews.
- README install instructions now show the unambiguous `plugin@marketplace` form and `/reload-plugins`, without implying the bare form (which is also valid) was wrong.
- Removed the duplicate `version` field from `marketplace.json`'s plugin entry — `plugin.json` is authoritative when both are set, per platform docs, so keeping both risked exactly the stale-version confusion the docs warn about.

## 0.1.0 — Initial release

- Six-specialist review architecture: correctness, security, policy/trust-boundary, test-evidence, architecture, interface.
- Shared reference docs: `TRUST_MODEL.md`, `SEVERITY_MODEL.md`, `FALSE_POSITIVE_RULES.md`, `OUTPUT_SCHEMA.md`.
- Orchestrator (`review-council` skill) runs inline and dispatches specialists in parallel via first-level `Agent` calls.
- Specialist agents restricted to `Read`, `Grep`, `Glob`.
- Scope support: `working-tree`, `diff <base>..<head>`, `pr <number>`, `commit <sha>`; `--tracked-only` and `--post-comment` flags.
- GitHub PR commenting gated behind the standard tool permission prompt.
- Not yet run through a full adversarial pressure-test pass; manifests and frontmatter validated, live plugin discovery/dispatch not yet verified in a real session.

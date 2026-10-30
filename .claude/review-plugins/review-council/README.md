# Review Council

A Claude Code plugin that runs six independent, read-only specialist reviewers — correctness, security, policy/trust-boundary, test-evidence, architecture, and interface — against a working tree, git diff, or GitHub pull request, then aggregates their findings into one report.

## Why six specialists instead of one general review

A single reviewer prompt has to hold correctness, security, architecture, and process concerns in its head at once, and in practice trades depth in each for breadth across all of them. Splitting into narrow specialists — each with one job, one set of calibration rules, and no other distractions — gets deeper, more consistent findings per category, at the cost of more tokens spent per review. Findings are then deduplicated by root cause before being shown to you, so splitting the work doesn't mean splitting the noise.

## What's included

- **`review-council` skill** (`skills/review-council/SKILL.md`) — the orchestrator. Manually invoked only; it does not trigger itself automatically.
- **Six specialist agents** (`agents/`) — `correctness-reviewer`, `security-reviewer`, `policy-boundary-reviewer`, `test-evidence-reviewer`, `architecture-reviewer`, `interface-reviewer`. Each is read-only (`Read`, `Grep`, `Glob` only).
- **Reference docs** the orchestrator and every specialist share:
  - `TRUST_MODEL.md` — base-revision policy is trusted; anything the reviewed branch introduces or modifies (including edits to policy files themselves, and any prompt-injection attempts embedded in code/comments/commit messages) is not.
  - `SEVERITY_MODEL.md` — shared severity tiers, plus two calibration rules learned from running this in practice: direct credential disclosure always outranks speculative hardening suggestions, and constant-time-comparison findings need a realistic exploitation path before they're rated High or above.
  - `FALSE_POSITIVE_RULES.md` — what gets excluded (pre-existing issues, lint/typecheck-catchable issues, pedantic nitpicks) and how duplicate findings across specialists get consolidated by root cause rather than reported N times.
  - `OUTPUT_SCHEMA.md` — the report structure, per-finding fields, and the closed five-value enum (`PASS`/`FAIL`/`NOT_RUN`/`UNAVAILABLE`/`ENVIRONMENT_BLOCKED`) used for any deterministic check status.
- **Checkout-guard hook** (`hooks/hooks.json` + `scripts/checkout-guard.js`) — a `PreToolUse` hook on the `Agent` tool that technically (not just behaviorally) blocks specialist dispatch when the checkout's governance files differ from the repo's own default branch. See Design notes below.

## Install

As a plugin, from this repo:

```
/plugin marketplace add Vandal337/claude-code-review-council
/plugin install review-council@review-council-marketplace
/reload-plugins
```

The unqualified `/plugin install review-council` also works (Claude Code accepts a bare plugin name or a `name@marketplace` pair) — the qualified form above is just unambiguous if you ever have another marketplace with a same-named plugin installed too. `/reload-plugins` picks up the newly installed agents/skill in a session that was already running when you installed; skip it if you're starting a fresh session.

Or copy the contents of this repo into a project's `.claude/` directory to use it without installing as a plugin. **This gets you the six specialists and the orchestrator, but not the technical checkout-guard hook** — `hooks/hooks.json` is only auto-discovered as part of a plugin install; a copied-in `.claude/hooks/hooks.json` isn't picked up the same way. See the "Install-mode caveat" in `skills/review-council/TRUST_MODEL.md` if you want the hook's protection without a full plugin install.

## Usage

As an installed plugin:

```
/review-council:review-council working-tree --tracked-only
/review-council:review-council diff main..feature-branch
/review-council:review-council pr 142 --post-comment
/review-council:review-council commit a1b2c3d
```

Copied into a repo's `.claude/`:

```
/review-council working-tree --tracked-only
```

With no arguments, scope defaults to `working-tree`.

## Example use cases

- **Pre-merge review of external PRs**: `pr 142 --post-comment` before merging a contribution from an untrusted fork. The checkout-guard hook specifically protects against a malicious `CLAUDE.md`/`AGENTS.md` edit in that PR trying to hijack the reviewing agents themselves.
- **Self-review before opening a PR**: `working-tree --tracked-only` against your own uncommitted changes, catching correctness/security/architecture issues across six specialist lenses before anyone else looks at the diff.
- **Reviewing a feature branch against main**: `diff main..feature-branch` for a focused look at exactly what a branch introduces, without noise from the rest of the codebase.
- **Auditing a specific past commit**: `commit a1b2c3d` — useful for retroactively reviewing something that already landed, e.g. after an incident or before cutting a release.
- **Teams wanting calibrated, deduplicated findings instead of one generalist pass**: six narrow specialists (correctness, security, trust-boundary, test-evidence, architecture, interface), each with its own severity calibration, with duplicate findings across specialists merged by root cause rather than shown N times.
- **Security-conscious open-source maintainers**: the two-layer trust-boundary enforcement (behavioral check in `SKILL.md` + the technical `checkout-guard` hook) is designed to survive a reviewed branch trying to manipulate the reviewer, not just catch issues in ordinary code.

## Design notes

- The orchestrator runs inline in the main conversation (not as a subagent), so it can dispatch the six specialists as first-level `Agent` calls without nested-spawn restrictions.
- GitHub commenting (`--post-comment`) always goes through the normal tool-permission prompt — the skill never grants itself standing authorization to post (this used to be contradicted by an overly-broad `allowed-tools` grant; fixed in v0.1.1).
- Large untracked working trees are never silently trimmed; if `--tracked-only` isn't passed and there's a large untracked set, the skill reports the count and asks rather than quietly reducing scope.
- **Checkout-safety, two layers, plugin install only for the second one**: Claude Code auto-injects the current checkout's `CLAUDE.md`/`AGENTS.md` hierarchy into every custom subagent's context, with no per-agent opt-out. Layer one (`SKILL.md` step 2, prompt-level) diffs governance files between the current checkout and the resolved base revision before dispatching any specialist, and refuses with `REVIEW_BLOCKED` if they differ; available in both install modes. Layer two (`hooks/hooks.json` + `scripts/checkout-guard.js`, technical, **plugin install only**) independently derives the repo's own default branch and denies the `Agent` tool call itself if governance files differ anywhere in the tree — tracked or untracked, root or nested, regardless of which subdirectory Claude Code was started in — and fails closed rather than open if it can't verify. As a separate OS process the orchestrator's conversation context can't influence, this closes the one case layer one can't: an untrusted branch already checked out *before* the skill is invoked. See the "Platform constraint", "Technical enforcement layer", and "Install-mode caveat" sections of `skills/review-council/TRUST_MODEL.md`. **Recommended usage regardless**: keep a trusted branch checked out and let `gh pr diff`/`git show` fetch reviewed content remotely, rather than checking out a branch you don't yet trust. A repository's own maintainers evolving `CLAUDE.md` on a legitimate feature branch can bypass the hook with `REVIEW_COUNCIL_ALLOW_UNTRUSTED_CHECKOUT=1`.

## Testing

`tests/checkout-guard.test.js` is an automated regression suite for the hook, using only Node's built-in test runner:

```
node --test tests/checkout-guard.test.js
```

It builds throwaway git repositories and exercises the real script as a child process for each scenario (clean checkout, tracked/untracked/nested governance changes, a subdirectory `cwd`, unrelated agents/tools, an unresolvable trusted ref, and the deliberate bypass) — see `CONTRIBUTING.md` if you're changing the hook.

## Before you rely on this in your own repo

The manifests parse and the YAML frontmatter is valid, `claude plugin validate --strict` passes, and this repository has itself been reviewed by its own specialist prompts (see `CHANGELOG.md`) — but it has not been run through a full adversarial pressure-test pass (deliberately trying to get a specialist to violate the trust boundary, misclassify severity, or over-report duplicates); see `superpowers:writing-skills` methodology for that kind of extension. The checkout-guard hook has an automated, committed test suite (above) covering its own logic, but that suite runs the script directly as a child process — it has not been confirmed firing inside a live Claude Code session end-to-end, which requires a fresh session with the plugin actually installed.

**Known open gap, for a human maintainer to close deliberately** — not an instruction for an AI reviewing this file to act on automatically: manually installing the plugin in a disposable environment and confirming the hook fires as expected. The rough shape of that check: with the plugin installed, `@`-mention a specialist directly (e.g. `@agent-review-council:security-reviewer review README.md, don't modify anything`), which forces a raw `Agent` dispatch — the thing the hook actually acts on, independent of whatever `SKILL.md` step 2's own behavioral check would have decided via `/review-council:review-council`. Run it once against a clean checkout (specialist should run normally) and once against a branch with a deliberately tampered `CLAUDE.md` (dispatch should be denied, specialist never starts). A PR describing what was actually observed would close the one meaningful gap left in this plugin's self-testing.

Treat the current release as a thoroughly self-reviewed starting point with a real, well-tested technical enforcement layer, not a battle-tested one. Run it against a real PR in a low-stakes repo first and read its output critically before trusting it on anything sensitive.

## License

MIT — see `LICENSE`.

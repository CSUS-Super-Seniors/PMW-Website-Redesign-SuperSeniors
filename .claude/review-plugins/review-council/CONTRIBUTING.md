# Contributing

Issues and PRs are welcome.

## Scope

This plugin is intentionally generic — it should work against any repository's own conventions, not assume a particular organization, architecture, or governance framework. Contributions that hardcode assumptions specific to one company, product, or team should go in a fork or a repo-local `.claude/` copy instead.

## Adding or changing a specialist agent

- Keep the tool grant to `Read`, `Grep`, `Glob` unless there's a specific, justified reason a specialist needs more (and if so, open an issue to discuss first — the read-only posture is deliberate).
- Each specialist should own one clearly bounded concern. If you find yourself writing "and also check for X" where X belongs to another specialist's lane, it probably does.
- Update `SEVERITY_MODEL.md` and `FALSE_POSITIVE_RULES.md` if your change introduces a new calibration rule, rather than burying the rule only inside the agent file — the orchestrator and other specialists need to see it too.

## Testing changes

**If you're changing `scripts/checkout-guard.js`**: run `node --test tests/checkout-guard.test.js` and confirm all scenarios still pass before opening a PR. It builds throwaway git repositories and exercises the real script as a child process (not a reimplementation of its logic) — no external test framework, no network access, no dependency install needed. Add a new test case for any bypass or behavior change you're fixing or introducing; don't just describe it in the PR.

There's no automated eval suite for the specialist agents themselves yet. Before opening a PR that touches `SKILL.md`, an agent file, or a reference doc:

1. Run `claude plugin validate . --strict` and confirm it passes.
2. Load the plugin locally (`claude --plugin-dir .`) and run `/review-council:review-council working-tree` against a repo with a small, known set of issues.
3. Confirm the specialist(s) you changed still produce findings with real file/line citations, and that severity/consolidation behave as documented.

If you're changing trust-boundary or severity-calibration behavior, include a short before/after example in the PR description showing what changed and why.

## Style

- Agent and skill files are documentation for another Claude instance, not for humans reading source code. Write instructions, not narrative.
- Keep `SKILL.md` focused on orchestration; put anything that reads as a shared rule (not specific to one step) in the relevant reference doc instead.

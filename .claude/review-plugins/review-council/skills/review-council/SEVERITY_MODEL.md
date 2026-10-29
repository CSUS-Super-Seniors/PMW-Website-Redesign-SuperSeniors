# Severity Model

All six specialists and the orchestrator use this shared scale. Assign the lowest tier the evidence actually supports — do not round up because an issue category "sounds serious."

## Tiers

- **Critical** — actively exploitable now, or guaranteed incorrect behavior, with severe impact: remote code execution, auth bypass, direct secret/credential disclosure, data loss, or a correctness bug that corrupts data or produces wrong results on the common path.
- **High** — real, demonstrable impact with a concrete trigger, but narrower blast radius or requiring specific conditions: an injection vulnerability reachable only from an authenticated context, a correctness bug on a less-common but real input, a breaking interface change with no migration path.
- **Medium** — a real defect, but with limited impact, an edge-case trigger, or an existing mitigating control: a bug on a rare input, a hardening gap without a demonstrated exploitation path, an architecture issue that adds real but bounded maintenance cost.
- **Low** — legitimate but minor: style-adjacent correctness nits, inconsistent-but-non-breaking interface changes, missing test coverage for a low-risk path.
- **Informational** — worth recording but not a defect: a hardening suggestion with no concrete exploitation path, a note on a pattern that's fine today but worth watching, a review-integrity observation.

## Calibration rules that override the general tiers

These come from lessons learned running this skill in practice. They exist because agents reliably over- or under-weight certain categories without an explicit rule.

### Direct credential disclosure outranks speculative hardening

A real, exposed secret (hardcoded API key, private key, password, live token in logs or output) is **always** reported and weighted above any number of "this could theoretically be hardened" observations. If a specialist has limited space or attention, direct disclosure findings go first. Don't let a long list of low-confidence hardening suggestions bury a genuine leaked credential.

### Constant-time comparison requires a realistic exploitation path before High

A non-timing-safe comparison of a secret value (`==` instead of `hmac.compare_digest` or equivalent) is not automatically High or Critical. Before assigning High or above, the finding must establish all three:

1. The compared value is actually secret (not, e.g., a public identifier)
2. The comparison is reachable by a remote or otherwise untrusted party
3. The timing signal is plausibly measurable over the actual transport and call pattern (a comparison buried behind other variable-latency work, or called too rarely to statistically time, doesn't qualify)

If any of the three isn't established, report it as Medium (real gap, no demonstrated path) or Low/Informational (theoretical hardening). State explicitly which of the three you could or couldn't establish.

### Duplicate manifestations consolidate by root cause

If the same underlying defect appears in multiple places (the same unsafe pattern copy-pasted across five files, the same missing check on every endpoint in a router), report it as **one finding** with all affected locations listed, not five separate findings. Severity is assigned to the root cause, not multiplied by occurrence count — though breadth of occurrence is worth noting as it affects fix scope.

### Deterministic checks use a fixed, closed enum

Wherever a finding references the pass/fail status of an automated check (test suite, lint, build, type check), the status must be one of exactly: `PASS`, `FAIL`, `NOT_RUN`, `UNAVAILABLE`, `ENVIRONMENT_BLOCKED`. No other label, and never `PASS` without having actually observed the check run. See `OUTPUT_SCHEMA.md`.

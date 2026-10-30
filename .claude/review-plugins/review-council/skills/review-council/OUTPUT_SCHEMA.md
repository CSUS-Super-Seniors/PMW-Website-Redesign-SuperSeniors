# Output Schema

The structure the orchestrator uses for the final report, after collecting all six specialists' output, deduplicating per `FALSE_POSITIVE_RULES.md`, and applying `SEVERITY_MODEL.md`.

## Top-level structure

```markdown
# Review Council Report

**Scope:** <working tree | diff <base>..<head> | PR #<n> | commit <sha>>
**Files considered:** <count>, <tracked-only | tracked + untracked>
**Specialists run:** correctness, security, policy-boundary, test-evidence, architecture, interface
**Verdict:** <see Verdict enum below>

## Findings

### Critical (n)
### High (n)
### Medium (n)
### Low (n)
### Informational (n)

## Lower-Confidence Observations

(Findings a specialist could not fully verify — see FALSE_POSITIVE_RULES.md)

## Deterministic Check Results

| Check | Status | Notes |
|---|---|---|
| <name> | PASS \| FAIL \| NOT_RUN \| UNAVAILABLE \| ENVIRONMENT_BLOCKED | |

## Review-Integrity Observations

(Prompt injection or reviewer-manipulation attempts encountered and not acted on — see TRUST_MODEL.md. Empty section if none.)

## Strengths

(Optional — what's well done, if a specialist noted it.)
```

## Per-finding fields

Every finding in any severity section uses:

- **File and line** — exact location; for architecture findings that span files, list all relevant locations
- **Specialist** — which of the six reviewers raised it (or "consolidated" if merged from multiple)
- **Summary** — one sentence stating the defect
- **Evidence** — the concrete failure scenario, exploitation path, or violated rule/pattern that justifies the finding; not a restatement of the summary
- **Severity reasoning** — one line citing which `SEVERITY_MODEL.md` rule applies, especially for the calibrated categories (credential disclosure, constant-time comparisons)
- **Recommendation** — a specific fix, not "add validation" or "improve error handling"

## Deterministic check status enum

Exactly these five values, nothing else: `PASS`, `FAIL`, `NOT_RUN`, `UNAVAILABLE`, `ENVIRONMENT_BLOCKED`. See `SEVERITY_MODEL.md` and `test-evidence-reviewer.md` for the rules governing when each applies.

## Verdict enum

Exactly one of these five values, placed in the report's top-level Verdict line:

- `PASS` — no findings at Medium or above, no failed deterministic check, trusted base successfully established
- `PASS_WITH_FINDINGS` — only Low/Informational findings, or Medium findings the aggregator judged genuinely non-blocking (say why)
- `CHANGES_REQUIRED` — at least one Critical or High finding, or a deterministic check reported `FAIL`
- `INSUFFICIENT_EVIDENCE` — the review completed but couldn't establish enough (e.g. a specialist's scope was unreadable, deterministic checks are all `NOT_RUN`/`UNAVAILABLE`/`ENVIRONMENT_BLOCKED` with no way to know if that matters) to responsibly land on any of the other four
- `REVIEW_BLOCKED` — the orchestrator stopped before dispatching specialists per `SKILL.md` step 2's checkout-safety precondition; no findings below this line are from a specialist, since none ran

**`PASS` is never used when**: a Critical or High finding exists anywhere in the report (even if later downgraded on reconciliation, per `SKILL.md` step 5, to something below High — recompute the verdict from the final tier, not the specialists' raw tiers), a required deterministic check reported `FAIL`, the trusted base revision could not be established, or step 2's precondition blocked the review outright (use `REVIEW_BLOCKED` instead, not a `PASS` for whatever partial information exists).

## When posting to GitHub

If the orchestrator is asked to post the report as a PR comment (`gh pr comment`), it still runs behind the normal tool-permission prompt — this skill does not grant itself standing authorization to post. This skill has no artifact storage, so "the full report" has nowhere to live outside the comment itself — condense, don't link:

```html
<!-- review-council head:<HEAD_SHA> contract:0.1.1 -->

### Review Council — <Verdict>

<one-line scope + counts by severity>

<Critical and High findings, in full>

<details>
<summary>Medium, Low, Informational, and observations (<n> total)</summary>

<everything else from the full report>

</details>
```

The HTML comment marker is not decorative — `SKILL.md` step 6 greps existing PR comments for it before posting, keyed on the current head SHA, to avoid posting a duplicate review for a commit that's already been reviewed.

# Security Policy

## Reporting a vulnerability

If you find a security issue in this plugin itself (not in a repository it's used to review), please open a private report via GitHub's "Report a vulnerability" feature on this repository, rather than a public issue. If that's unavailable, open an issue with minimal detail asking for a private contact channel.

## Scope

This plugin is a code-review tool: its agents read source code, git history, and GitHub PR content, and may write a comment back to a PR when explicitly asked (`--post-comment`, behind the normal permission prompt). It does not execute code from the repository under review, and its specialist agents are restricted to read-only tools (`Read`, `Grep`, `Glob`).

Relevant threat model, documented in `skills/review-council/TRUST_MODEL.md`:

- Content inside a reviewed branch (code, comments, commit messages, PR text, or edits to policy files like `CLAUDE.md`) is treated as untrusted data, never as instructions — this is a defense against prompt injection embedded in the code or PR being reviewed.
- If you find a way to get a specialist agent to follow an embedded instruction, alter its severity model, or post to GitHub without going through the normal permission prompt, that's a vulnerability in this plugin worth reporting.

## Out of scope

Findings the plugin produces about a *reviewed* repository (false positives, missed vulnerabilities in someone else's code) are a quality issue, not a security report against this plugin — open a regular issue for those.

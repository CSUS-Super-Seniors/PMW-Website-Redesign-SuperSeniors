# SSPMW-234 / 240 / 243 validation

## PR #74 blocking-review follow-up

- Started on `SSPMW-234` with a clean working tree. Fetched origin and merged `origin/main` without conflicts; integration commit: `99ba72d7188b816aa0da5041f9a9bf47149435c4`.
- Renamed the ordering migration to `20261126000000_service_city_display_order.sql`, later than main's latest migration (`20261125010000_find_or_create_customer.sql`). SQL semantics are unchanged.
- One shared reader owns active filtering, stored-name validation, invalid-row skipping, and sanitized count-only warnings. Estimate eligibility and the submit guard select only `name`; only public listing selects `display_order` and sorts presentation rows.
- Before the ordering migration, a missing ordering column produces a safe public-list 503, while estimate checks and submissions remain usable. Names-only database failures still prevent approval; no database-error fallback is used.
- Compatibility regression simulates PostgreSQL `42703` for ordering reads, verifies Carmichael accepted/Davis rejected through both estimate paths, and verifies names-only failure blocks checks and submission. Existing ordering and invalid-row tests remain in place.

## Current validation

Latest unchanged-code full `npm test` rerun: **1,876 passed, 15 database-dependent skipped, zero failures; exit 0**. Shared: 280 passed; client: 917 passed; server: 679 passed / 15 skipped.

The first follow-up full run had an unchanged Contact Page timeout and the existing Vercel photo `Retry-After` assertion failure (expected 60, received 58). A focused run also reproduced the photo assertion (59). Both passed on the full rerun; neither unrelated test nor application behavior was changed.

| Check                                              | Result                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------- |
| Focused service-city/service-area tests            | Pass: 31 tests across 2 files                                                     |
| Page focus and actual SVG/privacy tests            | Pass: 12 tests across 2 files                                                     |
| Service Area Chromium browser spec                 | Pass: 5 tests; desktop, phone, narrow layout and keyboard retry outcomes          |
| Repository lint                                    | Pass                                                                              |
| Workspace typecheck                                | Pass                                                                              |
| Prior local pgTAP after alignment                  | Pass: 133 assertions across 10 files; unchanged database/schema code              |
| Prior local transactional seed tests               | Pass: 5 tests; not rerun for application-only follow-up                           |
| Prior renamed migration on isolated database       | Pass: actual SQL executed; 4 constraint assertions; not a full fresh stack replay |
| Standard repository formatting                     | Fails on widespread CRLF checkout differences; no broad formatting/config changes |
| Repository formatting with `--end-of-line auto`    | Pass; diagnostic only, not a substitute for the standard check                    |
| Migration SQL comparison / old filename references | SQL unchanged (CRLF-normalized); no remaining old filename references             |

Workspace typecheck and build pass (Vite reports large-chunk warnings). Standard formatting passes for all modified/new Prettier-supported files, and `git diff --check` passes. SQL has no configured Prettier parser; the renamed migration was instead compared unchanged after CRLF normalization. The standard repository formatting check reports 269 files, consistent with the known CRLF checkout issue; `--end-of-line auto` passes diagnostically without configuration changes. Lint passes on rerun after an initial race with Playwright recreating its output directory. No committed screenshot refresh was needed: normal page artwork/layout is unchanged; browser-run captures are test output only.

## Local migration verification and history alignment

Verified the existing local schema: `display_order` was nullable `integer` with no default, and the validated constraint was `CHECK (display_order IS NULL OR display_order >= 0)`. The stored migration SQL matched the renamed file's semantics.

Executed the renamed file's actual SQL on a fresh isolated local database using the original service-city table DDL. Execution and all four pgTAP acceptance/rejection assertions passed. This is focused migration execution coverage, not a full fresh Supabase stack replay.

Reconciled only local history for the renamed migration after schema verification and applied main's two pending migrations without rerunning the existing ordering DDL. All 21 migration versions aligned; local pgTAP and seed tests passed afterward. No `--include-all`, reset, existing-data deletion, hosted database modification, or remote history repair was used.

## Release process and limitations

After integrating main, apply the renamed migration after main's migrations through the approved deployment process. Do not bypass its timestamp with `--include-all`. Backend eligibility no longer depends on the ordering migration; the public list needs it to become available. Preserve production city rows and never run the development seed in production.

- Final Q7 production-city confirmation is pending. Rancho Cordova remains provisional and becomes estimate-eligible wherever the development seed is applied.
- Draft-map design/client sign-off and comparison with approved frames are pending. Existing desktop/phone screenshots are fixture evidence, not artwork or coverage approval.
- Nonblocking follow-up: public listing uses the bounded trusted-IP limiter (60/minute), retry preserves keyboard focus without reclaiming it after departure, display names are trimmed/deduplicated after ordering, and both endpoints share one backend dependency. Regression checks inspect the rendered page and actual SVG for address content and Carmichael-only text labels; manual map approval remains required.
- No implementation commits or pushes; the main-integration merge is the sole commit exception. No reset, existing-data deletion, hosted database modification, or remote migration-history repair is authorized or performed.

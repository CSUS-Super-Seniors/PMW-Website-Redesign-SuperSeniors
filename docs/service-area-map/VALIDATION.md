# SSPMW-234 / 240 / 243 validation

Validated locally with Node 22.23.4 and npm 10.9.9. Dependencies installed using the existing lockfile (`npm ci`); no dependency manifest changes were made.

| Check                                              | Result                                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| ESLint                                             | Pass                                                                                    |
| Prettier, changed supported files                  | Pass                                                                                    |
| Repository-wide `npm run format:check`             | Local failures caused by CRLF checkout line endings; not preexisting code-style defects |
| `npx prettier --check . --end-of-line auto`        | Pass; diagnostic override only, no settings changed                                     |
| Standard CI formatting for this branch             | Not yet verified                                                                        |
| `npm run typecheck`                                | Pass                                                                                    |
| `npm test`                                         | Pass: shared 240, client 851, server 606; 15 database-dependent tests skipped           |
| `npm run build`                                    | Pass                                                                                    |
| Focused Service Area Playwright                    | 4 passed                                                                                |
| Full Playwright, `npm run test:e2e -- --workers=1` | 13 passed                                                                               |
| `git diff --check`                                 | Pass                                                                                    |
| Local database migrations                          | Pass with `npm run db:migrate -- --include-all`; no reset                               |
| Local database/RLS tests                           | Pass: latest `npm run db:test`, 8 files / 102 assertions                                |
| Local seed tests                                   | Pass: `npm run test:seed`, 5 tests, explicit loopback database URL                      |
| Local API database freshness                       | Pass: absent → active → inactive; same API process, no rebuild; temporary row deleted   |

The initial parallel browser run had photo-preview timeouts. A retry fixture also initially counted requests and was incorrect under development StrictMode. The fixture now remains failed until the explicit retry action. Both focused and full single-worker reruns passed.

Screenshots in `screenshots/` show the database-response fixture at desktop 1440px and phones 390px/320px. Reviewed desktop and 390px screenshots: shared header/footer, responsive stacking, visible attribution, real estimate/telephone links. Browser tests also check no horizontal overflow, local SVG decoding and keyboard focus. Screenshots are fixture evidence, not approval of production cities or artwork.

## Follow-up formatting and local database validation

Docker and local Supabase were already running; starting or resetting the stack was unnecessary. All database operations targeted `127.0.0.1:54322`, and the Supabase API target was `http://127.0.0.1:54321`. No hosted database was accessed.

The initial `npm run db:migrate` stopped because pending migration `20261110232413_unique_job_per_inquiry.sql` preceded an already-applied local migration. Initial database tests had one failed assertion (missing uniqueness index), and all five initial seed tests failed because `display_order` was absent. Following the CLI instruction, `npm run db:migrate -- --include-all` successfully applied that uniqueness migration and `20261122000000_service_city_display_order.sql`. No migration-history repair or reset was used. Reruns passed: 98 database assertions and five seed tests. Seed test environment: `SEED_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`. The existing seed tests use rollback transactions.

A temporary city named `SSPMW234 validation 670653a4-1e92-4142-bdf7-2bed0ce85f01` was tested through the current API's real HTTP listener, real repository, and local Supabase REST connection. Both endpoints returned 200 at each stage:

| Database state   | Listed by GET /api/service-cities | POST /api/estimates/service-area |
| ---------------- | --------------------------------- | -------------------------------- |
| Before insertion | No                                | `{ "inServiceArea": false }`     |
| Inserted active  | Yes                               | `{ "inServiceArea": true }`      |
| Deactivated      | No                                | `{ "inServiceArea": false }`     |

All stages used the same API process/backend with no rebuild or restart. List responses included `Cache-Control: no-store`. Cleanup deleted the temporary row in a finally block; a query confirmed zero matching rows, and a full before/after comparison confirmed all pre-existing service-city rows unchanged. The temporary API listener was closed. Local Supabase remains running as it was before validation.

The remaining local formatting failures concern CRLF checkout line endings, not preexisting code-style defects. `git ls-files --eol client/src/pages/ServicesPage.tsx` returned `i/lf w/crlf`: the Git index contains LF while the working-tree checkout contains CRLF. `npx prettier --check . --end-of-line auto` passed. This command was a diagnostic override only; Git configuration, Prettier settings, CI, and ignore rules were not changed.

The earlier comparison with a temporary `origin/main` checkout reproduced the line-ending-sensitive failures but did not establish preexisting code-style defects. That interpretation and the redundant per-file failure report have been removed. Modified and untracked story files passed the scoped formatting check; unsupported asset/SQL formats were left unchanged. Standard CI formatting has not yet been verified for this branch; the diagnostic pass does not establish that the standard CI formatting check passes.

## PR #74 automated-review follow-up

The shared active-city reader now skips individual names rejected by `cityField`, preserving valid display names, database ordering, and existing eligibility normalization. Public listing and estimate eligibility still use that same reader. Each successful read that rejects rows emits one fixed-format server warning containing only the rejected-row count; no names, raw rows, credentials, or database error details are logged. Invalid-only arrays return an empty public list and false eligibility. Database errors (even alongside array data) and non-array responses still throw and return sanitized 503 responses, not empty successful lists.

Regression coverage includes Carmichael alongside blank, whitespace-only, overlength, non-string, missing-name, and null rows; Davis remains outside. Tests verify valid-name preservation, ordering, normalization, invalid-only behavior, exact count-only warning arguments, no warnings for valid reads or failed database responses, and both endpoints' failure behavior.

Added transactional pgTAP coverage in `supabase/tests/service_city_display_order.test.sql`: NULL, zero, and positive ranks are accepted; negative ranks fail with SQLSTATE `23514`. Fixtures roll back. The ordering migration changed only to add its missing final newline; SQL semantics and migration history were not changed or reapplied.

| Follow-up check                                                             | Actual result                                                                                         |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm test -w server -- test/serviceCities.test.ts test/serviceArea.test.ts` | Pass: 27 tests across 2 files                                                                         |
| `npm run db:test`                                                           | Pass against local Supabase: 102 assertions across 8 files, including all 4 new constraint assertions |
| `npm run lint`                                                              | Pass                                                                                                  |
| `npm run typecheck`                                                         | Pass across workspaces                                                                                |
| Installed Prettier `--check . --end-of-line auto`                           | Pass; CRLF-aware diagnostic only, no configuration changes                                            |

Earlier seed and live API freshness results above remain valid historical checks; those checks were not rerun for this follow-up. Only local database services were used. Standard CI formatting remains unverified for this branch. Deploy the ordering migration before the updated backend through the approved release process.

## Outstanding acceptance/release work

- Confirm final Q7 production city list. No production data was changed. Provisional seed adds Rancho Cordova to estimate eligibility only in seeded development environments.
- Obtain design/client approval of the draft map and verify against the approved design frames.
- Local migration/seed/RLS validation is complete. Deploy the reviewed migration before the updated backend in the normal approved release process; no hosted migration was performed.
- Verify standard CI formatting for this branch. Local CRLF checkout failures are diagnosed; the passing `--end-of-line auto` diagnostic does not replace the standard CI check.
- `npm ci` reported 11 dependency vulnerabilities (10 moderate, one high). No audit-fix or dependency updates were attempted in this story.

No commits, pushes, resets, or hosted database modifications were executed. Local migrations and rollback-isolated seed tests were executed with explicit approval during this follow-up. The earlier external-review ZIP predates these updated validation notes and has not been regenerated.

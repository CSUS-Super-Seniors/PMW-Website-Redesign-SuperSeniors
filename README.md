# PMW Website Redesign (Super Seniors)

Rebuild of the Peterson Mobile Woodworking website plus an admin side (CRM, bookings, reporting). CSC 190/191 senior project, Sacramento State.

Jira: [Super Seniors - PMW Website Redesign](https://csus-super-seniors.atlassian.net)

## Stack

- `client/`: React + Vite + TypeScript + React Router + Tailwind CSS
- `server/`: Node.js + Express + TypeScript (all routes under `/api`)
- `shared/`: browser-compatible `@pmw/validation` workspace (Zod schemas and form configuration)
- Tests: Vitest (unit) and Playwright (browser).
- CI: GitHub Actions runs lint, format check, type check, and tests on every PR to `main`.

## Getting started

Prerequisites: Node.js 22 and Git. Docker Desktop is also needed to run the local Supabase database (`npm run db:start`).

```bash
git clone https://github.com/CSUS-Super-Seniors/PMW-Website-Redesign-SuperSeniors.git
cd PMW-Website-Redesign-SuperSeniors
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Run each in its own terminal:

```bash
npm run dev:server   # API on http://localhost:3001 (check /api/health)
npm run dev:client   # site on http://localhost:5173 (proxies /api to the server)
```

### Playwright in CI

The Playwright smoke-test job uses the official
`mcr.microsoft.com/playwright:v1.64.1-noble` container, which includes the browsers
and Linux browser dependencies. This avoids installing Ubuntu packages during
each run. The job still runs `npm ci` and the full `npm run test:e2e` suite, and
uploads failure reports. When updating Playwright, update the image tag in
`.github/workflows/ci.yml` to match the locked Playwright version. The other CI
jobs and local development commands are unchanged.

## Scripts (run from the repo root)

| Script                           | What it does                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm run dev:client`             | Start the Vite dev server                                                                           |
| `npm run dev:server`             | Start the API with auto reload                                                                      |
| `npm run lint`                   | ESLint across client and server                                                                     |
| `npm run format`                 | Format everything with Prettier                                                                     |
| `npm run format:check`           | Check formatting (what CI runs)                                                                     |
| `npm run typecheck`              | TypeScript check for both workspaces                                                                |
| `npm test`                       | Vitest for both workspaces                                                                          |
| `npm run build`                  | Production build of client and server                                                               |
| `npm run db:start`               | Start the local Supabase stack (needs Docker)                                                       |
| `npm run db:stop`                | Stop the local Supabase stack                                                                       |
| `npm run db:migration -- <name>` | Create a new empty migration file in `supabase/migrations` (does not apply it)                      |
| `npm run db:migrate`             | Apply new migrations to the local database                                                          |
| `npm run db:reset`               | Rebuild the local database from all migrations and `supabase/seed.sql`. Deletes existing local data |
| `npm run db:seed`                | Load the Figma sample data into `SEED_DATABASE_URL` (local, dev or staging). Refuses production     |
| `npm run test:seed`              | Rerun `supabase/seed.sql` against `SEED_TEST_DATABASE_URL` and check the result (CI runs it)        |
| `npm run verify:storage`         | Verify bucket settings, access controls, signed URLs, and expiration against local Supabase         |

## Environment variables

Copy `server/.env.example` to `server/.env`. Never commit `.env` files or keys.

| Variable                    | Purpose                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `PORT`                      | API port (default 3001)                                                                     |
| `NODE_ENV`                  | `development` locally                                                                       |
| `CLIENT_ORIGINS`            | Comma-separated origins allowed by CORS (the client, `http://localhost:5173` locally)       |
| `SUPABASE_URL`              | Supabase API URL. For local development, use the URL from `npx supabase status`             |
| `SUPABASE_PUBLISHABLE_KEY`  | Supabase publishable (anon) key                                                             |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key. Server only: never use it in `client/` or send it to the browser |
| `SEED_DATABASE_URL`         | Database `npm run db:seed` writes to. Holds a password, so keep it only in `server/.env`    |
| `SEED_ALLOWED_PROJECT_REFS` | Dev and staging Supabase project refs the seed may run against (comma-separated)            |
| `SEED_BLOCKED_PROJECT_REFS` | Production project refs. The seed always refuses these, even if they are also allowed       |
| `SEED_TEST_DATABASE_URL`    | Local database for `npm run test:seed`. Its changes are rolled back. Leave blank to skip it |

### Client (`client/.env`)

Copy `client/.env.example` to `client/.env`. Only variables that start with `VITE_` reach the browser, so never put the service role key here. Restart `npm run dev:client` after changing it.

| Variable                        | Purpose                                                                   |
| ------------------------------- | ------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Supabase API URL. Locally, use the URL from `npx supabase status`         |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key. Locally, use the one from `npx supabase status` |

## Estimate request Step 1 validation (SSPMW-297)

`@pmw/validation` provides the shared Step 1 schema, issue options, TypeScript types, and error
mapping for the client and server. Its source is `shared/src/estimateStep1.ts`.

- Public `POST /api/estimates/validate-step-1` accepts JSON without login and validates without
  saving an inquiry. Valid input returns HTTP 200 with `{ "valid": true }`; invalid schema input
  returns HTTP 400 with `valid: false`, `fieldErrors`, and `formErrors`.
- Client and server `dev`, `build`, `typecheck`, and `test` commands compile the shared package
  automatically.
- After editing shared code while a dev server is running, run
  `npm run build -w @pmw/validation` and restart that dev server.

### Step 1 handoff (SSPMW-296), Concerning SSPMW-24 and SSPMW-31

Step 1 validation, the responsive layout and the service-area check (SSPMW-24) are implemented.
Valid input in an active service city advances to optional photos. Back preserves the details,
City, honeypot value, and selected photos.

The current entry point is `client/src/pages/EstimateRequestPage.tsx`.
`client/src/App.test.tsx` and the photo e2e tests cover advancement, retries, and Back navigation.

### Service area check (SSPMW-24)

Step 1 has a required City field. After the details pass validation, the form asks the server
whether that city is in the `service_cities` table (active rows only). Capitalization, extra spaces
and a trailing state, ZIP code or country do not matter. A city outside the area shows an "Outside our service area"
error with a tap-to-call link, and the customer cannot continue. If the check can't run, the
customer also can't continue and is asked to try again.

- Public `POST /api/estimates/service-area` takes `{ "city": "Carmichael" }` and returns
  `{ "inServiceArea": true | false }`. It answers yes or no rather than sending the list (the
  active cities aren't secret; the Service Area page will show them). Bad input returns 400, an
  unreadable city list returns 503, and too many checks return 429 (see spam protection below).
- The submit route runs `requireServiceArea` (see spam protection below). It checks only the
  city: a missing or invalid city gets 400 with `fieldErrors.city`, and an outside-area city gets
  422 (`code: "outside_service_area"`) even when the browser check was skipped. The SSPMW-70
  handler reads `res.locals.inServiceArea` (typed as `ServiceAreaLocals`) for the inquiry's
  `in_service_area` column, and still validates the rest of the body.
- The city list is data, not code: add, rename or turn off a city in `service_cities` (Supabase
  Table Editor or SQL) and the next check uses it. `supabase/seed.sql` adds placeholder cities
  for local, dev and staging. Production cities come from the client's Q7 answer.

## Estimate form spam protection (SSPMW-95)

The estimate form is public and accepts photos, so the submit route is protected before its
handler (SSPMW-70) runs. `createApp(config, auth, contact, { serviceArea, estimateSubmit })`
mounts `POST /api/estimates` (`ESTIMATE_SUBMIT_PATH`) in this order: rate limit, JSON body,
honeypot, service-area check (`requireServiceArea`, SSPMW-24), then the handler. The handler is
typed as `EstimateSubmitHandler`, so `res.locals.inServiceArea` is known to be `true` there.
Both Express and Vercel now install the SSPMW-70 handler. A test app that omits it still answers 501.

- **Rate limit:** each visitor gets `ESTIMATE_RATE_LIMIT_MAX` submissions per
  `ESTIMATE_RATE_LIMIT_WINDOW_MINUTES` (default 5 per hour). A visitor is one IPv4 address, or
  one IPv6 /64 network so a bot can't rotate through its addresses. Over the limit, the reply is
  429 with a friendly message and a `Retry-After` header. The count lives in each server
  instance's memory, so it costs nothing but is per instance on Vercel.
  - Up to 50,000 visitors are tracked one by one. During a flood beyond that, new visitors are
    counted in 4,096 overflow buckets, chosen by network (an IPv4 /24 or IPv6 /48) so one network
    always lands in the same bucket, 10 requests per bucket per window. Nobody's limit is reset, one
    network can't use up the overflow for everyone, and new visitors are only slowed down if a flood
    from thousands of separate networks fills every bucket.
  - This limits each visitor, not the total. A total cap (for example, refusing new inquiries past
    a daily count) belongs in the SSPMW-70 handler, which can count saved inquiries.
  - `POST /api/estimates/service-area` has its own limit of 30 checks per 10 minutes. Over it,
    Step 1 asks the customer to wait a few minutes or call.
- **Honeypot:** Step 1 has a hidden `pmw_extra` field that people never see. The form hands
  its value to the page (`onContinue(details, spamCheck)`), which keeps it for the submit step.
  The submit request should send it. A filled honeypot gets a normal-looking 201 reply, but
  nothing is saved and no email is sent. An empty one is removed from the body before the handler
  sees it. Leaving the field out is treated as clean, so this catches bots that fill in every
  input, not scripts that post straight to the API (the rate limit covers those).
- **Photo checks:** `checkEstimatePhoto(bytes, contentType, maxBytes)` in
  `server/src/lib/photoChecks.ts` reads the file's first bytes, so a renamed non-image is refused
  (415) even when the browser checks are bypassed. Files over 10 MB are refused (413). The SSPMW-31
  photo backend calls it before storage with a 1 MiB limit for compressed files. It
  checks the file signature, not every byte, so photos must stay private and only be served back
  as images. Only JPG and PNG pass, matching the SSPMW-31 and SSPMW-95 stories.

### Estimate flow and photos (SSPMW-31 / SSPMW-39 / SSPMW-41)

Step 1 validates the details and checks the active service cities before opening optional photos.
Both server entry points provide service-area and photo backends through `createApp`'s fourth-argument options.
JPG/PNG originals up to 10 MiB (shown as 10 MB) compress to at most 1 MiB using the existing helper and upload to private `inquiry photos` storage on Next.
Zero photos needs no file upload, but an existing session may need renewal. Back preserves state; refresh loses it.
Failed uploads are retryable, successful uploads are reused, and removed photos are excluded.
The current screen is only a handoff, not submission; SSPMW-44 owns review and SSPMW-70 owns saving/emails.
The SSPMW-70 backend now verifies uploads and saves the inquiry plus its retained photo
links in one transaction. A photo conflict rolls the inquiry back; removed photos never
appear in the saved set. The page still stops at the handoff until SSPMW-44 connects review.

`useEstimatePhotos().uploadPhotos()` returns `{ photoSession: { token, expiresAt } | null, photos: [{ id, storagePath, receipt }] }`.
Final submission uses `prepareSubmission` to verify live capabilities and stored bytes,
then `submit_estimate_request` calls `reconcile_estimate_photos` within the inquiry transaction.
The older `attachPhotos` API remains available for draft reconciliation; the final route does
not create a draft inquiry first.

Keep tokens/receipts private, including the session when removing all photos. Finalized sets
cannot change. After a lost submit response, retry the same `submission_id` and exact original
payload before renewing/reuploading. The stored payload hash authorizes only that exact retry,
which returns the original INQ number without creating rows or sending emails again. Initial
submissions always require live photo capabilities; expiration never authorizes a new write.
Sessions last 24 hours; renewal preserves identity for seven days after expiry and reuploads retained files. After that, start a new request.
Photo requests time out after 30 seconds. Owner-only `GET /api/inquiry-photos/:photoId/view-url` returns five-minute signed views; SSPMW-95 protects the submit route, and its file checks are connected to the photo backend.
The page retains `{ details, spamCheck, photoSession, photos }` for the later review/submission flow.
SSPMW-44 must send `spamCheck.pmw_extra` with the final request through `POST /api/estimates`.
Both server entry points provide `estimateSubmit`; the database saves server-approved service-area membership.

- Preview: `/dev/estimate-photos` on Vite (development-only; Next uploads to the configured API/storage, but submits no inquiry).
- Browser checks: `npx playwright test e2e/estimate-photos.spec.ts --project=chromium` (desktop/phone, real compression, mocked uploads).
- Cleanup: `.github/workflows/cleanup-estimate-photos.yml` runs daily at 10:23 UTC with `--apply`, deleting only unattached uploads expired for over 24 hours. The command `npm run cleanup:estimate-photos -w server` remains a dry run by default.
- Before completion: `npm run verify:storage -w server` against local Supabase, normal migration deployment, and PR review/merge remain required.

#### Photo rate limiting behind Vercel

The Vercel entry point (`api/index.ts`) defaults `TRUST_PROXY_HOPS` to one so the
photo limiter uses each visitor's IP. Vercel overwrites `X-Forwarded-For` with the
connecting client's address ([Vercel request headers](https://vercel.com/docs/headers/request-headers));
Express reads the nearest forwarded address with this setting
([Express proxy configuration](https://expressjs.com/en/guide/behind-proxies/)).
The direct local server defaults `TRUST_PROXY_HOPS` to zero. Revisit this setting if the
hosting topology changes. Upload and submit limits remain instance-local; distributed limits are outside the current implementation.

#### Daily photo cleanup setup

Create a GitHub Actions environment named `estimate-photo-cleanup` for the Supabase
project whose uploads should be cleaned. Set its secrets `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`, and its variable `CLIENT_ORIGINS` to that deployment's
allowed website origin(s). The existing script validates these server settings;
it does not send HTTP requests to the website. Keep staging and production credentials separate.

The schedule starts only after the workflow reaches the repository's default branch
and these settings exist. Local changes alone do not activate it. From the Actions
tab, manually run **Clean up abandoned estimate photos** with `apply` unchecked to
inspect the eligible count; check `apply` to delete eligible objects. Scheduled runs
always apply cleanup. The job has read-only repository permissions, prevents
overlapping cleanup runs, and reports failures through its Actions run status.
The cleanup checks `inquiry_photos` before selecting expired objects for deletion;
attached and still-claimable uploads are retained. No live cleanup is needed to test this change.

### Lead source collection and handoff (SSPMW-92 / SSPMW-87)

Step 1 collects a required "How did you hear about us?" selection. It starts empty;
the customer must choose a source rather than inheriting a default. Requiring the
field is an implementation assumption consistent with the current form; the Jira
description does not explicitly state whether it is required.

`shared/src/leadSource.ts` exports `leadSourceOptions`, `leadSourceSchema`, and
`LeadSource` from `@pmw/validation`. Use this configuration for manual jobs
(SSPMW-311) and lead source reports (SSPMW-145) too.

| Stored value   | Display label |
| -------------- | ------------- |
| `google`       | Google        |
| `referral`     | Referral      |
| `social_media` | Social media  |
| `yelp`         | Yelp          |
| `other`        | Other         |

The shared Step 1 schema requires `lead_source`. The existing public validation
endpoint returns HTTP 400 with `fieldErrors.lead_source` for missing values,
unknown values, display labels, and incorrect JSON types. On acceptance, the
form's `onContinue(details, spamCheck)` includes the selected value unchanged in
`details`. The page retains it through the service-area check, photos, and Back
navigation. The endpoint only validates; it does not save an inquiry.

**Remaining acceptance criteria:** SSPMW-44 must show the corresponding
`leadSourceOptions` label on Step 3, preserve edits when navigating between steps,
and connect final submission to the API below. SSPMW-70 now revalidates the source
and inserts it into `public.inquiries.lead_source`. Backend tests cover rejection of
tampered/missing sources; the database tests cover all five stored source values.
SSPMW-92 remains pending review, integrated UI verification, or an approved scope change.

For UI verification, check `/estimate` at desktop and phone widths: empty
selection, missing-selection error, correction, checking/disabled state, server
field error, network failure and retry, and successful validation with the source
retained after going to photos and back. Check that an edited source survives
another trip through photos and Back navigation. Continuing from photos with
zero photos reaches the current "Your photos are ready" handoff notice; review
and final submission remain unavailable. Capture desktop and phone screenshots
for the PR.

## Final estimate submission (SSPMW-70 / SSPMW-75 / SSPMW-77 / SSPMW-80)

Apply `20261111000000_submit_estimate_request.sql` after the existing photo migrations.
It adds nullable submission ID/hash columns (legacy/sample rows need no changes) and a
service-role-only transaction function. Existing RLS and owner-only signed photo viewing
remain in force. No customer record is created.

`POST /api/estimates` accepts a flat JSON body:

```ts
const payload = {
  ...handoff.details,
  ...handoff.spamCheck,
  submission_id: crypto.randomUUID(),
  photoSession: handoff.photoSession,
  photos: handoff.photos,
};
```

The caller must retain this exact payload and ID through network failures and retries.
Create a new ID only for a new request or edited details, never automatically on timeout.
Do not log the payload, session token or receipts. `photoSession` defaults to `null` and
`photos` to `[]`; keep any existing session even if every photo was removed.

A final request accepts at most **10 photos**, using shared `MAX_ESTIMATE_PHOTOS`.
`estimateSubmissionSchema` refuses an oversized array with HTTP 400 before inquiry
lookup, photo verification, saving, or emails. `prepareSubmission` also checks the
count before session verification or any storage call; the older `attachPhotos`
entry point enforces the same bound. For accepted 1 MiB uploads, normal verification reads
at most 10 MiB for a submission. The future review UI should use the shared constant
for immediate selection feedback; the server remains authoritative.

The server runs the IP limiter, honeypot, current service-area check, shared final schema,
and signed photo/byte checks. It stores all validated customer strings as submitted,
`lead_source`, `in_service_area = true`, and `status = 'new'` (displayed as New).
The existing database sequence and unique constraint assign INQ numbers; gaps are normal.
Inquiry creation and photo finalization commit together. Duplicate submission IDs are
serialized in Postgres across server instances, not held in an in-memory map.

| HTTP      | Result                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| 201       | `{ success: true, inquiry_number: "INQ-1049" }`; same response for exact saved retries                             |
| 400       | Shared validation errors, including `fieldErrors` for Step 1 fields and `formErrors` for submission/photo metadata |
| 401 / 403 | Invalid/expired photo capability or another session's receipt                                                      |
| 409       | Same submission ID with a different payload, a missing/changed uploaded object, or conflicting photo links         |
| 422       | Outside service area, with `code: "outside_service_area"`                                                          |
| 429       | Existing IP limit; respect `Retry-After`                                                                           |
| 503       | Area lookup, storage or database unavailable; retry the exact payload                                              |

A filled honeypot retains SSPMW-95's fake `{ success: true }` response, with no save/email.
No browser-provided status, customer ID, INQ number or service-area flag is accepted.

After a newly committed inquiry, Resend receives separate messages:
**Estimate request received** to the customer and **New estimate request: INQ-…** to
`CONTACT_OWNER_EMAILS`. Both reuse `RESEND_API_KEY` and `RESEND_FROM_EMAIL` from the
existing contact setup. Keep all three valid settings together, or leave all three blank.
With all three blank, estimates still save and each unsent notification is logged;
the contact endpoint retains its existing 503 behavior.

Each email has an inquiry-specific idempotency key and a ten-second timeout. Both sends
are awaited together so serverless execution can finish them; "non-blocking" means an
email error cannot fail or undo the save. Failure logs include inquiry ID/number,
notification kind, a fixed `reason`, and a numeric `httpStatus` when available.
Reasons are `http_error`, `not_configured`, `invalid_response`, `timeout`,
`request_error`, or `unknown_error`. Request errors can include network failures;
provider bodies, exception messages/stacks, arbitrary error names, customer fields,
credentials, and tokens are never logged. Exact submission retries never resend mail, including after
the provider's idempotency window. Delivery is best effort: a crash after commit or an
email failure has no automatic retry worker in this story. Resend acknowledgement is
not proof of inbox delivery. SSPMW-197 supplies the filtered customer receipt below;
SSPMW-206 supplies the owner summary and its inquiry detail link.

The customer receipt includes only the filtered first name and item, saved INQ number,
fixed confirmation/next-step wording, and business contact information. It omits other
submitted fields and photo credentials. Keep the photo cap and bounded failure-log
context when integrating dependencies; the shared Resend sender preserves HTTP status
in `EmailDeliveryError`.

The merge hold remains: merge PR #56 into main first, integrate main into #66 and
retarget #66 to main, then rerun CI before merging #66, #68, and #69 in that order. PR #65 must also be
merged before #69 so the owner link reaches the integrated inquiry detail page.
Preserve main's `inquiries:` application option and `business.js` validation export
alongside estimate submission wiring when resolving integration conflicts.

Run the ordinary checks plus database tests against local Supabase with all migrations:

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run db:migrate
npm run db:test
```

The concurrency tests use real, separate Postgres connections. Set
`SUBMISSION_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`
in the shell, then run `npm run test:submission-db`. They refuse hosted databases, remove
only their own test rows, and leave normal number-sequence gaps. A missing URL fails the
explicit command; ordinary `npm test` skips this suite when no URL is provided. CI runs
it after the existing RLS and seed checks.

Manual acceptance still requires a test request on dev/staging: confirm one New inquiry,
its source and photos through an owner signed view; verify both emails arrive. Repeat
with Resend forced to fail and confirm 201 plus the saved inquiry and sanitized logs.
Retry the original request and confirm the same INQ number with no duplicate inquiry or
emails. The current `/estimate` page does not yet submit; SSPMW-44 owns the review screen
and its success/error presentation, including desktop/phone screenshots.

### Customer receipt (SSPMW-197 / SSPMW-201)

`server/src/estimateReceiptEmail.ts` builds the receipt sent to the trimmed email
address on the submitted form. It confirms the first name, saved INQ number and
item, explains that the request will be reviewed, and includes the shared business
phone number. The HTML version uses 18px body text, a fluid single-column layout
and a tappable phone link. A complete plain-text fallback is included. The footer
shows Carmichael, CA, with no business street address.

The receipt reuses `server/src/lib/resendEmail.ts` and the same server-only Resend
settings as contact messages. Replies go to `CONTACT_OWNER_EMAILS`. Customer text
is HTML-escaped, and link-like names/items use neutral fallback wording through
the same filter as decline emails. The receipt omits service addresses, contact
details, descriptions, internal notes and photo credentials. N9 (SSPMW-173) will
supply the shared branded layout once available; the receipt layout is provisional.

No new environment settings or database migrations are required. The existing
submission handler sends only after a newly committed inquiry, isolates receipt
failure from the owner notice, and returns the saved INQ number with HTTP 201 even
when sending fails. Exact submission retries never send a second receipt.

Focused checks: `npm run test -w server -- test/estimateReceiptEmail.test.ts test/estimateSubmission.test.ts test/declineEmail.test.ts test/contactBackend.test.ts`.
Run the repository lint, format, typecheck and unit-test checks as well.

For staging acceptance, submit a new estimate through `POST /api/estimates`
(SSPMW-44 still owns the review-screen connection). Verify one saved inquiry and
the customer's receipt, including the actual name, INQ number, item and business
phone. Inspect the email at phone and desktop widths and retain screenshots for
review. Force the receipt send to fail in an isolated test environment: confirm
HTTP 201, the saved inquiry, the independent owner notice attempt and a sanitized
receipt-failure log. Retry the exact submission and confirm no duplicate inquiry
or emails. Tests cover these paths with a mocked provider; they do not establish
staging delivery.

### Owner estimate notice (SSPMW-206 / SSPMW-211)

`server/src/ownerNoticeEmail.ts` builds the plain-text summary sent to
`CONTACT_OWNER_EMAILS` after a new estimate is committed. It includes the saved INQ
number, customer name, item, city, a readable label for what happened, and a direct
link to `/portal/inquiries/<saved inquiry UUID>`. The summary omits contact fields,
service addresses, free-form descriptions, internal notes and photo credentials.
Photos are never attached. Full details and private photo viewing stay in the
owner-only portal. N9 (SSPMW-173) will provide the shared branded layout once available.

Set `OWNER_PORTAL_ORIGIN` in `server/.env` and in the intended Vercel environment.
Use the exact HTTPS origin that hosts the SSPMW-144 detail page, with no path,
trailing slash, query, fragment or credentials. For local testing, use
`http://localhost:5173`; HTTP is restricted to `localhost`, `127.0.0.1` and `[::1]`.
A preview needs its actual preview-site origin while the
detail page is still unmerged; a production or staging origin must host the same
integrated detail route. Restart the server after changing this setting.

The origin comes only from server configuration, never a request header or submitted
field. The portal and sender share `shared/src/inquiryLinks.ts` so both use the same
encoded inquiry path. The link contains the inquiry ID, with no login token or signed
photo URL. A signed-out owner goes through staff login and returns to that inquiry;
an employee remains blocked by the owner-role check.

The notice uses the shared Resend sender, the existing verified From address, and a
per-inquiry `estimate/<UUID>/owner` idempotency key. Missing or invalid portal settings
produce a fixed warning at startup in both the local and Vercel entry points, without
echoing the configured value. They fail only the owner send after saving, with reason
`not_configured`; they do not stop startup, undo the inquiry, block the independent
customer receipt, or change the successful HTTP 201 response.
The server logs inquiry identifiers, the failed notification kind, a fixed reason and
an HTTP status when available, without provider response bodies or customer fields.
The existing exact-payload retry path never sends either email again, including after a send failure.

Focused server checks:
`npm run test -w server -- test/ownerNoticeEmail.test.ts test/estimateSubmission.test.ts test/vercelEntry.test.ts test/inquiries.test.ts test/inquiryDetailBackend.test.ts`.
The client check is `npm run test -w client -- src/pages/InquiryEmailLink.test.tsx`.
Also run the ordinary repository checks and Playwright smoke tests. The inherited
leave-guard test selects SSPMW-92's required lead source before advancing to photos.

For manual acceptance, submit to the integrated API using test recipients, confirm
one New inquiry and the owner summary, and open its link both signed in and signed out.
Verify the exact INQ number and item after login, and verify an employee cannot view
it. Opening a New inquiry can mark it Reviewed (`contacted`) through SSPMW-144's
existing behavior; check initial `new` status before visiting the detail page.
Repeat the exact payload and confirm the original INQ number and no extra emails.
With only the portal setting absent in an isolated development run, submit a new ID
and confirm HTTP 201, the saved inquiry, an owner-failure log, and the independent
customer receipt. Restore the setting and restart afterward. Staging delivery and
link navigation require the integrated SSPMW-144 branch plus the intended Resend
configuration; local tests do not establish staging acceptance.

### Leaving an unfinished estimate (SSPMW-64 / SSPMW-69)

The estimate page uses the existing shared `ConfirmationDialog` when a customer
tries to leave through site links, Cancel, or browser Back/Forward with entered
details or selected photos. Incomplete and invalid entries count as data; the
hidden honeypot does not. Clearing all entered values and removing photos turns
the guard off. Moving between estimate steps or same-page anchors does not prompt.

**Cancel**, Escape, and closing the dialog keep the current step and all data.
**Discard** resumes the intended navigation. Leaving unmounts the request page,
clearing its in-memory details, photos, upload session, and handoff. Uploaded,
unattached files remain subject to the existing abandoned-upload cleanup.

Refresh, tab closing, and full document navigation use the browser's native
`beforeunload` warning while data exists. Its wording and availability are
browser-controlled, especially on mobile. No draft is persisted across a confirmed reload.

`client/src/main.tsx` uses `createBrowserRouter` / `RouterProvider` so the existing
App route tree supports `useBlocker`. Tests mounting the estimate page must likewise
use a data router, such as `createMemoryRouter`.

`useEstimateLeaveGuard(hasData)` returns `{ blocker, markSubmitted, startNewRequest }`.
SSPMW-53/70 must call `markSubmitted()` only after confirmed server submission,
before navigating to Thanks. It permits immediate navigation and disables both
warnings. A new request must clear the old draft/photos and call `startNewRequest()`
if reusing the same mounted page. The current photo handoff is not submission and
remains protected. The success/reset contract is covered in hook tests; wiring it
into the real submission flow remains pending SSPMW-53/70.

Browser coverage: `npx playwright test e2e/estimate-leave-guard.spec.ts --project=chromium`.
The spec captures desktop and phone versions of the dialog in `test-results/`.

## Contact messages (SSPMW-268 / SSPMW-364)

Public `POST /api/contact-messages` accepts `name`, `message` (up to 500 characters),
and at least one of `phone` or `email`. The Contact page and API share the email,
phone, and message-length rules. Valid US phones are stored as `+1` followed by
10 digits; empty optional contact fields become SQL `null`.

Set `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (a verified bare sender address), and
`CONTACT_OWNER_EMAILS` (comma-separated owner addresses) in `server/.env` and the
deployed API environment. Set all three together and restart the API. Empty
recipient entries are ignored; at least one valid address is required. If all
three settings are blank, the contact route is unavailable and other routes run.

HTTP 201 means the message was saved with its creation time. The server then
attempts the plain-text N6 owner notification; failed notifications are logged
with the saved message ID and still return 201, so the page shows receipt instead
of prompting duplicate submissions. Validation failures return 400 with inline
field errors; configuration or save failures return 503. Notification acceptance
does not prove inbox delivery. N9 branding will be adopted when available.

## Decline email (SSPMW-215)

`server/src/declineEmail.ts` builds and sends the email a customer gets when an owner declines their
estimate request: a short plain-text message with their first name, inquiry number, item and the
business phone number. Internal notes are never included. Nothing sends it yet: the decline action
(SSPMW-172) will call it, and until that ships no decline emails go out.

Because the form doesn't verify email addresses, a name or item that looks like a link, an email
address, a domain or a phone number (or runs long) is replaced with a plain word, so spam text isn't
resent from the business's domain. Words joined by a dot only count as a domain when the ending is a
real top-level domain, so names like "Mr.Smith" are kept. The check also catches phone numbers written with other dashes,
`~` or non-ASCII digits, and links hidden with invisible characters, which are dropped from the text
that is sent. SSPMW-172 should also offer declining spam without emailing. The email uses the same
Resend settings as contact messages (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`), and replies go to
`CONTACT_OWNER_EMAILS`. Both emails send through `server/src/lib/resendEmail.ts`. The wording is a
draft until Girlie and Todd approve it.

For SSPMW-172: save the inquiry's status as `closed` first, then call
`notifyCustomerOfDecline(createDeclineEmailFromConfig(config), inquiry)`. That call never throws, so
a failed email can't undo the decline. It returns `sent`, `already_sent`, `no_email` (no address, or
not a usable one), `unavailable` (email not configured) or `failed`, so the screen can tell the owner
whether the customer was emailed. Each send uses a Resend idempotency key made from the inquiry and
the address, so within 24 hours a retried decline doesn't email the customer twice (`sent` or
`already_sent`), while a decline sent again after the address was corrected reaches the new address.
If another send for the same decline is still running, the result is `failed`, and retrying is safe.

## Database

The schema lives in `supabase/migrations` and is only changed through migration files in a pull request, never by hand in the Supabase dashboard. The `db:migrate` and `db:reset` scripts only touch the local database (`--local`).

### Local Supabase values for `server/.env`

After `npm run db:start`, run `npx supabase status`. It prints the local API URL (`http://127.0.0.1:54321`) and both keys. Copy them into `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Local Auth redirects go to `http://localhost:5173`, the client dev server, and password reset links open `/staff/reset-password`.

### Supabase Auth settings

Local Auth settings come from `supabase/config.toml`. After changing that file, run `npm run db:stop` and `npm run db:start` so local Supabase picks it up. Set the same values in each hosted Supabase project (dev, staging, production) under **Authentication** in the dashboard:

- **URL Configuration:** the Site URL is that environment's website address, and **Redirect URLs** includes `<site address>/staff/reset-password`, so the password reset email opens the Reset password page.
- **Sign In / Providers > Email:** minimum password length of 8, to match the Reset password page, and email OTP expiration of 3600 seconds, because the pages say reset links work for 1 hour.
- **Emails > SMTP Settings:** send through Resend (SSPMW-354). The built-in sender only allows 2 emails per hour. When the hourly email limit is used up, Forgot password still shows "Check your email" (so it never reveals who has an account), but no email goes out.
- **Emails > Templates > Reset Password:** keep the link as `{{ .ConfirmationURL }}`. The Reset password page reads the sign-in from that link.

Locally, Auth emails such as password resets never leave your computer. Open http://127.0.0.1:54324 to read them. `npm run verify:password-reset` checks the whole reset flow against local Supabase: the email arrives, its link opens `/staff/reset-password`, the new password signs in, the old one stops working, and a used link shows as expired. It uses the `server/.env` values.

### Making schema changes

1. `npm run db:start` to start the local database (Docker Desktop must be running).
2. `npm run db:migration -- add_example_table` to create a migration file.
3. Write the SQL in the new file in `supabase/migrations`.
4. `npm run db:migrate` to apply it to your local database. Your local data is kept.
5. Commit the migration file and open a pull request.
6. Optional: `npm run db:reset` to check the schema rebuilds cleanly from every migration. This deletes your local data.

If a migration changes a table that `supabase/seed.sql` fills (customers, customer_notes, inquiries, jobs, job_steps), update the seed in the same pull request. `db:reset` runs it after the migrations.

## Environments and sample data

Each environment has its own Supabase project, so no two environments share a database. A project's ref is the part of its URL before `.supabase.co`.

| Environment | Database                                                             | App                                           | Variables come from                     |
| ----------- | -------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------- |
| Dev         | Local Supabase (`npm run db:start`) or the team's shared dev project | `npm run dev:server` and `npm run dev:client` | `server/.env` and `client/.env`         |
| Staging     | Its own Supabase project for client demos (SSPMW-227)                | Vercel preview deploy                         | Vercel Preview environment variables    |
| Production  | Its own Supabase project with real customer data (SSPMW-365)         | Vercel production deploy                      | Vercel Production environment variables |

Every environment sets the same variables with its own values:

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server) and `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (client build) point at that environment's own Supabase project. Never copy one environment's keys into another.
- `CLIENT_ORIGINS` is that environment's site address (`http://localhost:5173` in dev).
- `NODE_ENV` is `development` in dev and `production` in staging and production builds.
- The `SEED_*` variables only go in a developer's `server/.env`. Never add them to Vercel.

### Staging setup and verification (SSPMW-227)

The existing hosted PMW Website Redesign Supabase project is used for
staging. Developers use local Supabase through Docker. Production will
use a separate Supabase project under the client's account.

#### Git branches and deployment environments

| Git source                         | Deployment target                                 |
| ---------------------------------- | ------------------------------------------------- |
| Local development                  | Local React, Express, and Supabase through Docker |
| Feature branches and pull requests | Vercel Preview with staging Supabase              |
| `main`                             | Vercel Production once production is configured   |

Vercel Preview requires these environment variables:

- `SUPABASE_URL` (server)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side secret)
- `CLIENT_ORIGINS` (allowed website origins)
- `VITE_SUPABASE_URL` (client)
- `VITE_SUPABASE_PUBLISHABLE_KEY` (client)

Never expose the service role key through a `VITE_` variable.
Configure Preview and Production environment variables separately.

#### Staging verification

The initial staging deployment was verified for:

- Homepage and static assets
- `/api/health` endpoint
- Supabase authentication
- Staff login and logout
- All 10 approved database migrations, confirmed with
  `supabase migration list`

Only apply database migrations to staging after their pull requests
have been approved and merged into `main`. Do not apply unmerged
database changes or destructive operations to staging.

Protected staff API authorization requires separate verification
after the staff profile permission fix is merged.

#### DigitalOcean retirement

DigitalOcean is the legacy hosting platform. Its resources must be
confirmed shut down before the hosting migration is marked complete.
The Vercel migration is tracked separately under SSPMW-387.

### Sample data

`supabase/seed.sql` holds the sample data shown in the Figma mockups: customers such as Margaret Lewis, inquiries such as INQ-1048, and jobs J-1001 to J-1005. Running it again puts those rows back to their sample values instead of adding copies. Rows created in the app, such as extra jobs, notes or steps, are left alone.

- **Local:** `npm run db:reset` loads it automatically. To load it without wiping your data, run `npm run db:seed` (if your `server/.env` is older than this script, copy the `SEED_` lines from `server/.env.example` first).
- **Dev or staging:** get the project's connection string from the Supabase dashboard (**Connect**, Session pooler). Apply the migrations first with `npx supabase db push --db-url "<connection string>"`. Then run the seed with that string and the project's ref, either by setting `SEED_DATABASE_URL` and `SEED_ALLOWED_PROJECT_REFS` in `server/.env` or for one run only:

  ```bash
  SEED_DATABASE_URL="<connection string>" SEED_ALLOWED_PROJECT_REFS=<ref> npm run db:seed
  ```

  It prints how many sample customers, inquiries and jobs are in the database (7, 5 and 5).

- **Production:** never seeded. `npm run db:seed` refuses any Supabase project that is not in `SEED_ALLOWED_PROJECT_REFS`, refuses anything in `SEED_BLOCKED_PROJECT_REFS`, and refuses to run when `NODE_ENV` is `production`. The connection string may only add `?sslmode=`, so it can't point the seed somewhere other than what was checked. Don't run `seed.sql` by hand there, and don't use `supabase db push --include-seed`, `supabase db reset --linked` or `supabase db reset --db-url`, which also run it. Leave `PGOPTIONS` unset; the seed refuses to run with it.

Seed a new dev or staging database before creating jobs or inquiries in the app, so J-1001 to J-1005 and INQ-1044 to INQ-1048 are still free. If they are taken, the seed stops without changing anything and says so. After seeding, new jobs and inquiries continue from the next number (J-1006, INQ-1049).

`npm run test:seed` checks the rerun behavior above automatically. It runs the seed twice against `SEED_TEST_DATABASE_URL` (for local Supabase, `postgresql://postgres:postgres@127.0.0.1:54322/postgres`) and confirms there are no copies, edited sample rows go back to their sample values, rows made in the app are left alone, and new numbers start after the samples. It only runs against local Supabase (the same check as `npm run db:seed`), and everything it does (including restarting the number sequences) happens in one transaction that is rolled back, so the database is left as it was. CI runs it in the RLS job. If a migration changes a seeded table, update `seed.sql` and run this test.

## Design tokens

Colors, fonts, text styles, spacing, radius and shadows come from the Figma design system page and live in `client/src/styles/theme.css`. Run the client and open http://localhost:5173/design-tokens to see them all (development only).

- Colors: `bg-dark-brown`, `text-neutral-600`, `bg-amber`, `border-neutral-300`, and so on. Tailwind's default palette is turned off, so only brand colors exist.
- Text styles: one class per Figma text style, for example `type-h1`, `type-body-lg`, `type-button`, `type-overline`. Use `type-body-lg` for paragraphs on public pages.
- Spacing: Tailwind's normal scale (4px steps) matches Figma, so `p-3` is 12px and `px-20` is 80px.
- Never hard-code hex values or arbitrary colors like `bg-[#123456]`. A test fails the build if you do.

## Contact form preview

In `client/.env`, set `VITE_CONTACT_FORM_STUB=success` or
`VITE_CONTACT_FORM_STUB=failure` and restart `npm run dev:client`.
These development-only previews simulate the sending and result states without
saving or emailing messages. Leave the value empty to use the API.
Production builds always use the API, even if a stub is configured.

## Workflow

1. Pull the latest `main`, then create a branch named after the Jira key: `SSPMW-123-short-description`.
2. Commit with the Jira key in the message, e.g. `SSPMW-123 add estimate form`.
3. Push the branch and open a pull request into `main`. Fill in the PR template.
4. CI must pass and one teammate must approve before merging. Direct pushes to `main` are blocked.

## Deploying (Vercel)

The application is hosted on Vercel using one project:

- `client/`: React and Vite frontend, built into `client/dist`.
- `api/index.ts`: Vercel serverless entry point for Express.
- `server/`: Existing Express application and API routes.
- `shared/`: Shared validation package.
- `vercel.json`: Build configuration, API rewrites, and SPA routing.

### Requirements

- Node.js 22.x
- Vercel account and CLI
- Hosted Supabase project with authorized credentials

### Environment variables

Configure the following in the Vercel project settings:

| Variable                        | Purpose                         |
| ------------------------------- | ------------------------------- |
| `SUPABASE_URL`                  | Hosted Supabase project URL     |
| `SUPABASE_SERVICE_ROLE_KEY`     | Server-only secret for Supabase |
| `CLIENT_ORIGINS`                | Allowed frontend origins        |
| `VITE_SUPABASE_URL`             | Public Supabase URL for React   |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public Supabase publishable key |

For contact submissions, also configure `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `CONTACT_OWNER_EMAILS` in the intended Vercel environment, as described in the contact setup above. The serverless entry initializes the contact backend when these settings are present. Without them, the contact endpoint returns 503 while other routes remain available.

Never expose `SUPABASE_SERVICE_ROLE_KEY` through a `VITE_` variable or commit it to Git.

The serverless API automatically adds exact HTTPS origins for `VERCEL_URL` (unique deployment), `VERCEL_BRANCH_URL` (stable branch alias), and `VERCEL_PROJECT_PRODUCTION_URL` (production address) when set. These system variables contain hostnames without a scheme. Enable Vercel system environment variables for this behavior. Other origins remain blocked.

For additional custom domains, configure their exact origins in `CLIENT_ORIGINS`.

Preview and Production environment variables must be configured separately. Configure the hosted project as described in [Supabase Auth settings](#supabase-auth-settings).

### Branches and environments

After connecting Git integration, set the Vercel Production Branch to `main`:

- Merges to `main` deploy to **Production** using Production environment variables.
- Non-production branches and pull requests deploy to **Preview** using Preview environment variables. This includes `SSPMW-387-vercel-deployment` and `SSPMW-227-staging-setup` while they remain active.
- Use a selected branch's stable Preview URL for staging verification, with Preview variables pointing to staging Supabase. This does not create a separate custom Staging environment. Configure Production credentials independently before cutover.

Verify the Git integration and Production Branch setting in Vercel; repository configuration alone does not establish them. See [Vercel environments](https://vercel.com/docs/deployments/environments).

### Hosting plan before launch

[Vercel Hobby](https://vercel.com/docs/plans/hobby) is limited to personal, non-commercial use. Before launching the client's business website, discuss this restriction with the professor and client and agree on a suitable commercial hosting plan. Do not assume the class project makes a commercial launch eligible for Hobby.

### Initial setup

From the repository root:

```bash
npx vercel login
npx vercel link
```

Select the repository root (`./`) as the code directory.

Git integration may require approval from the GitHub organization administrator.

### Local verification

```bash
npm ci
npm run build -w client
npm run build -w server
npm run lint
npm run typecheck
npm test
```

The root `npm run typecheck` command checks both server source and `api/index.ts` through `server/tsconfig.typecheck.json`. The server build still uses its original configuration and emits `server/dist/index.js` for local startup.

### Preview deployment

Run:

```bash
npx vercel deploy
```

Note: Vercel may assign a new project's first deployment to Production. Later deployments without `--prod` use Preview.

After deployment, verify these URLs using the generated Preview deployment address:

- `/` — React homepage
- `/staff/login` — React Router fallback
- `/api/health` — Express health endpoint

For deployments protected by Vercel Authentication:

```bash
npx vercel curl /api/health --deployment <deployment-url> -i
npx vercel curl /staff/login --deployment <deployment-url> -i
```

Expected API health response:

```json
{ "status": "ok" }
```

Confirm the website's JavaScript and CSS assets load successfully. Test authentication and password reset; the reset email should open `/staff/reset-password`. Test a contact submission as well: `/api/health` does not verify contact backend wiring or email delivery.

### Production deployment

Production deployment requires the correct Production environment variables, authorized deployment access, and successful testing.

When approved:

```bash
npx vercel deploy --prod
```

Do not remove or shut down the existing DigitalOcean application until the team approves the migration and verifies the replacement deployment.
To verify the API locally, configure the required environment variables, start the backend with `PORT=8080`, and request `http://localhost:8080/api/health`.

## Testing and CI (SSPMW-232)

The client uses Vitest with jsdom and React Testing Library. The server uses Vitest
with Supertest. Playwright runs a real Chromium browser against the local Vite
web server, which Playwright starts automatically. The public homepage smoke test
does not require a running Supabase database or Express API.

From the repository root:

```bash
npm ci
npm test                    # Both workspaces' Vitest suites
npx playwright install chromium
npm run test:e2e           # Playwright starts and stops Vite automatically
```

For debugging locally, run `npm run test:e2e -- --headed`.
GitHub Actions runs the existing **Lint, format, and test** check and the new
**Playwright smoke test** check on each PR to `main`.

A repository admin must mark both job checks as required under the `main`
branch protection rule (or repository ruleset) before a failing test can
prevent merging. Use the exact check names above after an initial PR run.

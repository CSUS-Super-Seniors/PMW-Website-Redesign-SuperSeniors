# PMW Website Redesign (Super Seniors)

Rebuild of the Peterson Mobile Woodworking website plus an admin side (CRM, bookings, reporting). CSC 190/191 senior project, Sacramento State.

Jira: [Super Seniors - PMW Website Redesign](https://csus-super-seniors.atlassian.net)

## Stack

- `client/`: React + Vite + TypeScript + React Router + Tailwind CSS
- `server/`: Node.js + Express + TypeScript (all routes under `/api`)
- `shared/`: browser-compatible `@pmw/validation` workspace (Zod schemas and form configuration)
- Tests: Vitest (unit). Playwright is added later (SSPMW-232).
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

## Contact messages (SSPMW-268 / SSPMW-278 / SSPMW-280)

Public `POST /api/contact-messsages` accepts JSON with `name`, `message`, and at least one
of `phone` or `email`. Both contact methods may be supplied; every supplied
nonblank method must be valid. Unknown fields are refused. Text is trimmed;
empty, missing, or null optional contact fields are stored as SQL `null`.
Limits are 100 characters for name, 32 for phone, 254 for email, and 5000 for
message. Phone accepts the same US formats as the Step 1 form. The shared
schema and error mapper are exported from `@pmw/validation`.

The server saves to `contact_messages`, letting the database assign `id` and
`created_at`, then sends the plain-text **New contact message** notification
(N6) through Resend to the configured owners. It uses the verified sender
address, with the visitor's email as Reply-To when provided. No visitor email
is used as From, and no message text is interpreted as HTML.

| Response                                             | Meaning                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `201`, `{ "success": true }`                         | Saved and accepted by Resend for sending                          |
| `400`, `success: false`, `fieldErrors`, `formErrors` | Validation failed; nothing saved or emailed                       |
| `503`, `success: false`                              | Email is not configured or saving failed; no email attempted      |
| `502`, `success: false`                              | Saved, but the email send failed or timed out; keep the saved row |
| `400` / `413`, `error`                               | Malformed JSON / request larger than 32 KiB                       |

The Contact page should use the success state only on HTTP 201 and show its
Send failed state on a non-2xx response or network failure. This snapshot of
`main` does not yet include the C4 Contact page, so its end-to-end check must
be done when that page is available. A new POST creates a new row; client
retries are not deduplicated. Resend receives an idempotency key per saved
message, so retrying a notification for that same row does not duplicate
emails within Resend's retention window. An accepted send is not a delivery
receipt; verify the test message reaches both owners' inboxes.

Set these **server-only** values in `server/.env` (and in the deployed API's
runtime environment), then restart the server:

| Variable               | Value                                               |
| ---------------------- | --------------------------------------------------- |
| `RESEND_API_KEY`       | Resend key with permission to send email            |
| `RESEND_FROM_EMAIL`    | Bare sender email on a domain verified in Resend    |
| `CONTACT_OWNER_EMAILS` | Comma-separated email addresses for Todd and Girlie |

Set all three together. If all are blank, the contact route returns 503
without saving and the rest of the API remains available. Partial or invalid
configuration fails startup with an environment-variable error. Owner
addresses and keys are never returned to visitors or committed to source.
The implementation uses Node's built-in fetch against Resend's REST API;
no new npm dependencies are required.

Apply the new migration locally with `npm run db:migrate`. It permits direct
SELECT only for active owners; anonymous visitors cannot read the table, and
employees, inactive owners, and visitors without staff profiles see no rows.
Browser inserts are denied: public submissions go through the Express route
and its server-only service-role client. This feature does not add an owner
inbox API or screen.

Run `npm test` for the shared-schema, route, adapter, and existing tests. With
Docker Desktop and local Supabase running, also run
`npx supabase test db` for the database permission tests in
`supabase/tests/contact_messages.test.sql`. Those tests use temporary fixture
users and roll back their data. The current CI workflow runs the mocked
route/email tests; the database permission test is a separate local check.

For a real email check, start the configured API and submit a test message:

```bash
curl -i http://localhost:3001/api/contact-messages \
  -H "Content-Type: application/json" \
  -d '{"name":"Contact API test","email":"your-test-address@example.com","message":"Please confirm both owners received this test message."}'
```

Use a test email address you control. Confirm HTTP 201, the saved row's
timestamp, and receipt by both owners. Resend's test sender may restrict
recipients; use the team's verified domain for the owner-inbox check.

## Database

The schema lives in `supabase/migrations` and is only changed through migration files in a pull request, never by hand in the Supabase dashboard. The `db:migrate` and `db:reset` scripts only touch the local database (`--local`).

### Local Supabase values for `server/.env`

After `npm run db:start`, run `npx supabase status`. It prints the local API URL (`http://127.0.0.1:54321`) and both keys. Copy them into `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Local Auth redirects go to `http://localhost:5173`, the client dev server.

### Making schema changes

1. `npm run db:start` to start the local database (Docker Desktop must be running).
2. `npm run db:migration -- add_example_table` to create a migration file.
3. Write the SQL in the new file in `supabase/migrations`.
4. `npm run db:migrate` to apply it to your local database. Your local data is kept.
5. Commit the migration file and open a pull request.
6. Optional: `npm run db:reset` to check the schema rebuilds cleanly from every migration. This deletes your local data.

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

## Deploying (DigitalOcean App Platform)

The deployment configuration is defined in `.do/app.yaml`.

The application has two components:

- `api`: Express backend, listening on port 8080, serving `/api/*`.
- `web`: React/Vite static site, serving `/` with `index.html` as the fallback for client-side routes.

Both components deploy from the `main` branch after changes are merged.

### Before deploying

1. Confirm the DigitalOcean account has the required billing or promotional credits.
2. Connect the `CSUS-Super-Seniors/PMW-Website-Redesign-SuperSeniors` GitHub repository.
3. In DigitalOcean App Platform, select **Create App** and load `.do/app.yaml`.
4. On the create-app environment variables screen, enter the Supabase values **before starting the first deployment**:
   - **API service (runtime):**
     - `SUPABASE_URL`: Supabase project URL.
     - `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (secret).
   - **Web static site (build time):**
     - `VITE_SUPABASE_URL`: Supabase project URL.
     - `VITE_SUPABASE_PUBLISHABLE_KEY`: Supabase publishable key.
5. Confirm the environment variables and estimated cost before creating the app.

Never commit real credentials to the repository. The frontend's `VITE_` variables are embedded in the browser build and must never contain the service role key.

The app spec sets `NODE_ENV=production`, `PORT=8080`, and `CLIENT_ORIGINS=${APP_URL}`. Never commit real secret keys.

### After deploying

1. Wait for both components to finish deploying.
2. Visit `https://<app-domain>/api/health` and confirm it returns `{"status":"ok"}`.
3. Open the website and verify that its pages load.
4. Test authentication with the configured Supabase project.
5. Check deployment logs if any checks fail.

### Local verification

From the repository root:

```bash
npm ci
npm run build -w server
npm run build -w client
npm test
```

To verify the API locally, configure the required environment variables, start the backend with `PORT=8080`, and request `http://localhost:8080/api/health`.

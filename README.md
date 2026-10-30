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

## Deploying (DigitalOcean App Platform)

Hosting is moving to Vercel (SSPMW-387). This section stays until that change replaces it.

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
6. Set the hosted Supabase project's Auth settings listed in [Supabase Auth settings](#supabase-auth-settings).

Never commit real credentials to the repository. The frontend's `VITE_` variables are embedded in the browser build and must never contain the service role key.

The app spec sets `NODE_ENV=production`, `PORT=8080`, and `CLIENT_ORIGINS=${APP_URL}`. Never commit real secret keys.

### After deploying

1. Wait for both components to finish deploying.
2. Visit `https://<app-domain>/api/health` and confirm it returns `{"status":"ok"}`.
3. Open the website and verify that its pages load.
4. Test authentication with the configured Supabase project, including a password reset: the email should open `/staff/reset-password`.
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

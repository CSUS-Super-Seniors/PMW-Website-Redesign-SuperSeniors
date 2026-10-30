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

## Database

The schema lives in `supabase/migrations` and is only changed through migration files in a pull request, never by hand in the Supabase dashboard. The `db:migrate` and `db:reset` scripts only touch the local database (`--local`).

### Local Supabase values for `server/.env`

After `npm run db:start`, run `npx supabase status`. It prints the local API URL (`http://127.0.0.1:54321`) and both keys. Copy them into `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Local Auth redirects go to `http://localhost:5173`, the client dev server.

### Development, staging, and production environments (SSPMW-227)

The PMW project uses separate environments to protect hosted data and keep development testing isolated.

| Environment | Database                                              | Application                     |
| ----------- | ----------------------------------------------------- | ------------------------------- |
| Development | Local Supabase through Docker                         | Local React and Express servers |
| Staging     | Existing hosted PMW Website Redesign Supabase project | Vercel Preview deployments      |
| Production  | Separate Supabase project when the website launches   | Future production deployment    |

#### Local development

Team members should run Supabase locally through Docker using `npm run db:start`.

Run `npx supabase status` to obtain the local API URL and keys. Configure `server/.env` and `client/.env` using those local values rather than the hosted staging credentials.

#### Staging

The existing hosted Supabase project is designated for staging. Vercel Preview connects to it using environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side secret only)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `CLIENT_ORIGINS`

Never expose the service role key through a `VITE_` variable.

The Vercel staging application has been deployed and its homepage, static assets, and `/api/health` endpoint have been verified.

Automatic GitHub deployments are pending repository integration access.

#### Git branches and deployment targets

| Source                             | Environment          | Deployment                                                    |
| ---------------------------------- | -------------------- | ------------------------------------------------------------- |
| Local development                  | Development          | React, Express, and local Supabase through Docker             |
| Feature branches and pull requests | Staging              | Vercel Preview using the hosted staging Supabase project      |
| `main`                             | Production (planned) | Vercel Production with a separate production Supabase project |

The staging preview has been deployed manually and tested.
Automatic GitHub-triggered deployments are not yet enabled because
the Vercel GitHub App requires organization owner approval.

Production deployment and its separate Supabase credentials
must be configured before launch.

#### Database migrations

Only apply migrations to hosted staging after their pull request has been approved and merged into `main`.

Test migrations against a fresh local Supabase database before applying them to staging.

Do not run unmerged seed scripts or destructive database operations against the hosted staging database.

#### Production

Production will use a separate Supabase project under the client's account when the website launches. Do not use staging data or staging service credentials for production.

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

## Deployment (Vercel)

Vercel is the intended hosting platform for the PMW website.
The staging application is currently deployed manually to
Vercel Preview and connects to the hosted staging Supabase project.

### Vercel environment variables

Configure these variables in Vercel's Preview environment:

- `SUPABASE_URL` — hosted staging Supabase URL (server)
- `SUPABASE_SERVICE_ROLE_KEY` — secret server-side key
- `CLIENT_ORIGINS` — allowed client origins
- `VITE_SUPABASE_URL` — hosted staging Supabase URL (client)
- `VITE_SUPABASE_PUBLISHABLE_KEY` — public client key

The backend requires `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and `CLIENT_ORIGINS`.
The frontend requires both `VITE_` Supabase variables.

Never expose `SUPABASE_SERVICE_ROLE_KEY` in a `VITE_` variable.

### Staging deployment verification

The manually deployed staging preview has been verified for:

- Homepage and static assets
- `/api/health` endpoint
- Supabase authentication
- Successful staff login and logout
- Staging database migrations

Automatic GitHub deployments are pending organization-owner
approval of the Vercel GitHub integration.

### DigitalOcean retirement

DigitalOcean is the previous deployment platform and is no
longer the intended hosting target. The legacy `.do/app.yaml`
configuration should not be used for new deployments.

DigitalOcean resource shutdown must be verified separately.
Do not consider the hosting migration fully complete until
those resources are confirmed inactive.

### Production deployment

Production will use a separate Supabase project and production
environment variables. Do not reuse staging secrets or
staging customer data in production.

### Local verification

From the repository root:

```bash
npm ci
npm run build -w server
npm run build -w client
npm test
```

To verify the API locally, configure the required environment variables, start the backend with `PORT=8080`, and request `http://localhost:8080/api/health`.

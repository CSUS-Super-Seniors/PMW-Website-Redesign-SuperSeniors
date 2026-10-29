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

Never expose `SUPABASE_SERVICE_ROLE_KEY` through a `VITE_` variable or commit it to Git.

The serverless API automatically adds the current deployment's `VERCEL_URL` to its allowed origins. Enable Vercel system environment variables for this behavior.

For additional custom domains, configure their exact origins in `CLIENT_ORIGINS`.

Preview and Production environment variables must be configured separately.

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

Confirm the website's JavaScript and CSS assets load successfully.

### Production deployment

Production deployment requires the correct Production environment variables, authorized deployment access, and successful testing.

When approved:

```bash
npx vercel deploy --prod
```

Do not remove or shut down the existing DigitalOcean application until the team approves the migration and verifies the replacement deployment.

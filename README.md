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

Both applications import `estimateStep1Schema`, `issueOptions`, `mapEstimateStep1Errors`, and
the inferred `EstimateStep1Input` / `EstimateStep1Data` types from `@pmw/validation`.
The implementation lives in `shared/src/estimateStep1.ts`; Zod is a direct production dependency
of that workspace. It has no React, Express, environment, or database dependencies.
Client and server `dev`, `build`, `typecheck`, and `test` commands first compile the shared
workspace to JavaScript and declarations, so the existing deployment build commands still work.
If shared code changes while a dev server is running, run `npm run build -w @pmw/validation`
and restart that dev server.

### Application decisions

These defaults are implementation decisions for SSPMW-297, not requirements attributed to Jira
or Figma. Maximum lengths apply to submitted strings, including surrounding whitespace.

| Field         | Rule                                                                        |
| ------------- | --------------------------------------------------------------------------- |
| `first_name`  | Required text, maximum 100 characters; Unicode names are accepted           |
| `last_name`   | Required text, maximum 100 characters; Unicode names are accepted           |
| `email`       | Required email format, maximum 254 characters; plus-addressing is accepted  |
| `phone`       | Required US phone format, maximum 32 characters                             |
| `text_ok`     | Optional boolean, defaults to `false`; explicit `false` is valid            |
| `address`     | Required free-text service address, maximum 300 characters                  |
| `city`        | Optional text, maximum 100 characters; omission and empty strings are valid |
| `item`        | Required free text, maximum 200 characters                                  |
| `issue_type`  | Required exact value from `issueOptions`                                    |
| `description` | Required free text, maximum 1,000 characters                                |

Required strings cannot be empty or whitespace-only. Emptiness, email, and phone checks use
trimmed copies; accepted strings retain their submitted whitespace, casing, and formatting.
Phone validation accepts ten digits or eleven with leading country code `1`, with optional
`+` before that country code, balanced area-code parentheses, and common spaces, hyphens, or
periods. It performs no phone lookup, extension support, or email DNS checks.
Incorrect JSON types and unknown fields are rejected without coercion.

`issueOptions` is the single source of dropdown labels and schema values. Its nine approved
provisional options remain pending Todd's Q9 response. SSPMW-296 should render these options
with an empty-value "Select a problem" placeholder, which fails validation. The `other` option
("Other / not sure") is valid and uses the existing description field.

Description is included because the written story specifies it despite its absence in the
mockups. City remains optional because the mockups provide no separate city control; it is
never inferred from the address. `preferred_contact` is outside this contract and is not derived.
No Social Security number field is included.

### Public endpoint and client integration

`POST /api/estimates/validate-step-1` accepts the Step 1 object as `application/json`, without
login. It only validates and does not save or submit an estimate request.

- Valid schema input: HTTP 200, `{ "valid": true }`.
- Invalid schema input: HTTP 400,
  `{ "valid": false, "fieldErrors": { "email": "Enter a valid email address." }, "formErrors": [] }`.
- Invalid top-level JSON values and unknown fields appear in `formErrors`. Each `fieldErrors`
  value is one customer-facing string, directly usable as a form component's `error` prop.
- Malformed JSON retains HTTP 400, `{ "error": "Invalid JSON" }`; requests over the existing
  1 MB limit retain HTTP 413, `{ "error": "Request too large" }`. These parser errors are
  separate from the schema response (`EstimateStep1ValidationResponse`).

For SSPMW-296, validate locally with `estimateStep1Schema.safeParse(input)` and pass failures to
`mapEstimateStep1Errors(result.error)`. Render `formErrors` at form level. Submit the same input
to the endpoint for server validation; HTTP 200 confirms validation only. The inferred input
type permits omitted `text_ok`; the parsed data type includes its boolean default. Do not add
`preferred_contact` or later wizard fields to this request.

Tests live in `shared/test/estimateStep1.test.ts`, `server/test/estimateStep1.test.ts`, and
`client/src/lib/estimateStep1.test.ts`. Run them individually with the corresponding workspace's
`npm test` command, or all together with `npm test` from the root.

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

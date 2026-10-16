# PMW Website Redesign (Super Seniors)

Rebuild of the Peterson Mobile Woodworking website plus an admin side (CRM, bookings, reporting). CSC 190/191 senior project, Sacramento State.

Jira: [Super Seniors - PMW Website Redesign](https://csus-super-seniors.atlassian.net)

## Stack

- `client/`: React + Vite + TypeScript + React Router + Tailwind CSS
- `server/`: Node.js + Express + TypeScript (all routes under `/api`)
- Tests: Vitest (unit). Playwright is added later (SSPMW-232).
- CI: GitHub Actions runs lint, format check, type check, and tests on every PR to `main`.

## Getting started

Prerequisites: Node.js 22 and Git. Docker Desktop is also needed to run the local Supabase database (`npm run db:start`).

```bash
git clone https://github.com/CSUS-Super-Seniors/PMW-Website-Redesign-SuperSeniors.git
cd PMW-Website-Redesign-SuperSeniors
npm install
cp server/.env.example server/.env
```

Run each in its own terminal:

```bash
npm run dev:server   # API on http://localhost:3001 (check /api/health)
npm run dev:client   # site on http://localhost:5173 (proxies /api to the server)
```

## Scripts (run from the repo root)

| Script                           | What it does                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev:client`             | Start the Vite dev server                                                           |
| `npm run dev:server`             | Start the API with auto reload                                                      |
| `npm run lint`                   | ESLint across client and server                                                     |
| `npm run format`                 | Format everything with Prettier                                                     |
| `npm run format:check`           | Check formatting (what CI runs)                                                     |
| `npm run typecheck`              | TypeScript check for both workspaces                                                |
| `npm test`                       | Vitest for both workspaces                                                          |
| `npm run build`                  | Production build of client and server                                               |
| `npm run db:start`               | Start the local Supabase stack (needs Docker)                                       |
| `npm run db:stop`                | Stop the local Supabase stack                                                       |
| `npm run db:migration -- <name>` | Create a new empty migration file in `supabase/migrations`                          |
| `npm run db:migrate`             | Apply new migrations to the local database                                          |
| `npm run db:reset`               | Rebuild the local database from all migrations (and `supabase/seed.sql` if present) |

## Environment variables

Copy `server/.env.example` to `server/.env`. Never commit `.env` files or keys.

| Variable                    | Purpose                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `PORT`                      | API port (default 3001)                                                                     |
| `CLIENT_ORIGIN`             | Origin allowed by CORS (the client)                                                         |
| `SUPABASE_URL`              | Supabase project URL (dev project; ask the team, never commit it with keys)                 |
| `SUPABASE_PUBLISHABLE_KEY`  | Supabase publishable (anon) key                                                             |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key. Server only: never use it in `client/` or send it to the browser |

## Database

The schema lives in `supabase/migrations` and is only changed through migration files in a pull request, never by hand in the Supabase dashboard.

1. `npm run db:start` to start the local database.
2. `npm run db:migration -- create_some_table` to add a migration, then write the SQL in the new file.
3. `npm run db:reset` to rebuild the local database from every migration and check it applies cleanly.

## Workflow

1. Pull the latest `main`, then create a branch named after the Jira key: `SSPMW-123-short-description`.
2. Commit with the Jira key in the message, e.g. `SSPMW-123 add estimate form`.
3. Push the branch and open a pull request into `main`. Fill in the PR template.
4. CI must pass and one teammate must approve before merging. Direct pushes to `main` are blocked.

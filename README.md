# PMW Website Redesign (Super Seniors)

Rebuild of the Peterson Mobile Woodworking website plus an admin side (CRM, bookings, reporting). CSC 190/191 senior project, Sacramento State.

Jira: [Super Seniors - PMW Website Redesign](https://csus-super-seniors.atlassian.net)

## Stack

- `client/`: React + Vite + TypeScript + React Router + Tailwind CSS
- `server/`: Node.js + Express + TypeScript (all routes under `/api`)
- Tests: Vitest (unit). Playwright is added later (SSPMW-232).
- CI: GitHub Actions runs lint, format check, type check, and tests on every PR to `main`.

## Getting started

Prerequisites: Node.js 22 and Git.

```bash
git clone https://github.com/XplosiveCow/PMW-Website-Redesign-SuperSeniors.git
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

| Script                 | What it does                          |
| ---------------------- | ------------------------------------- |
| `npm run dev:client`   | Start the Vite dev server             |
| `npm run dev:server`   | Start the API with auto reload        |
| `npm run lint`         | ESLint across client and server       |
| `npm run format`       | Format everything with Prettier       |
| `npm run format:check` | Check formatting (what CI runs)       |
| `npm run typecheck`    | TypeScript check for both workspaces  |
| `npm test`             | Vitest for both workspaces            |
| `npm run build`        | Production build of client and server |

## Environment variables

Copy `server/.env.example` to `server/.env`. Never commit `.env` files or keys.

| Variable        | Purpose                             |
| --------------- | ----------------------------------- |
| `PORT`          | API port (default 3001)             |
| `CLIENT_ORIGIN` | Origin allowed by CORS (the client) |

## Workflow

1. Pull the latest `main`, then create a branch named after the Jira key: `SSPMW-123-short-description`.
2. Commit with the Jira key in the message, e.g. `SSPMW-123 add estimate form`.
3. Push the branch and open a pull request into `main`. Fill in the PR template.
4. CI must pass and one teammate must approve before merging. Direct pushes to `main` are blocked.

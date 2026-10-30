# PMW Website Redesign: review rules

These are the team's rules. Code reviews check every pull request against them.

## Project

- Node 22, npm workspaces: `client` (React + Vite + TypeScript), `server` (Express + TypeScript), `shared`.
- Database: Supabase. Schema changes happen only through migration files in `supabase/migrations`, never by hand in the dashboard.

## Every PR must

- Name its Jira key (SSPMW-123) in the branch name and in the Jira section of the PR description.
- Pass `npm run lint`, `npm run format:check`, `npm run typecheck`, and `npm test`.
- Meet every acceptance criterion on its Jira story. Partial work is called out, not hidden.
- Add or update tests for any behavior it changes.
- Update the README when it adds a script, an environment variable, or a setup step.

## UI work must

- Include desktop and phone screenshots in the PR.
- Handle loading, error, empty, and success states.
- Work at phone width without horizontal scrolling, and work with the keyboard.

## Security

- Never commit `.env` files, keys, or tokens.
- The Supabase service role key is server-only. It must never appear in `client/` or in any `VITE_` variable.
- Validate input on the server, even when the client already validates it.
- Every new table has row level security policies, and those policies have tests.

import { parse } from 'pg-connection-string';

// Decides whether the sample-data seed may run against SEED_DATABASE_URL.
// Fails closed: a remote database is only allowed when its Supabase project is
// listed in SEED_ALLOWED_PROJECT_REFS (dev and staging). Production is never listed.
// The checks run on the same parsed values the seed connects with, so the URL
// cannot point the connection somewhere other than what was checked.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
// Local Supabase database port (supabase/config.toml, [db] port).
const LOCAL_SUPABASE_PORT = 54322;
// Query parameters allowed in SEED_DATABASE_URL. Others (host, user, port, options...)
// would change where pg connects, so they are refused.
const ALLOWED_QUERY_PARAMS = new Set(['sslmode']);
const POOLER_HOST = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/;

export interface SeedConnection {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  ssl?: boolean | object;
}

export interface SeedTarget {
  kind: 'local' | 'supabase';
  host: string;
  projectRef?: string;
  connection: SeedConnection;
}

/** Reads the Supabase project ref from a direct (db.<ref>.supabase.co) or pooler connection. */
export function supabaseProjectRef(host: string, user: string): string | undefined {
  const direct = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(host);
  if (direct) return direct[1];

  // Pooler connections put the ref in the user name: postgres.<ref>
  if (POOLER_HOST.test(host)) return /^[a-z_]+\.([a-z0-9]+)$/.exec(user)?.[1];

  return undefined;
}

function clean(value: string): string {
  return value.replace(/["'`]/g, '').trim().toLowerCase();
}

/** Splits a list of project refs. A project URL or host also counts as its ref. */
function listFromEnv(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[\s,;]+/)
    .map((item) => {
      const entry = clean(item);
      return /([a-z0-9]+)\.supabase\.co/.exec(entry)?.[1] ?? entry;
    })
    .filter(Boolean);
}

export function checkSeedTarget(env: NodeJS.ProcessEnv): SeedTarget {
  const raw = env.SEED_DATABASE_URL?.trim();
  if (!raw) {
    throw new Error(
      'SEED_DATABASE_URL is missing. For local Supabase, copy it from server/.env.example into server/.env.',
    );
  }

  if (clean(env.NODE_ENV ?? '') === 'production') {
    throw new Error('The seed never runs when NODE_ENV is production.');
  }

  // pg sends PGOPTIONS with every connection, and the Supabase pooler can pick a
  // project from it, so it could send the seed to a project that was not checked.
  if (env.PGOPTIONS?.trim()) {
    throw new Error('Unset PGOPTIONS before running the seed.');
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('SEED_DATABASE_URL must be a postgres:// or postgresql:// URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('SEED_DATABASE_URL must be a postgres:// or postgresql:// URL.');
  }

  for (const name of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_PARAMS.has(name.toLowerCase())) {
      throw new Error(`Remove "?${name}=" from SEED_DATABASE_URL. Only sslmode is allowed.`);
    }
  }

  // pg-connection-string is the parser pg itself uses.
  const parsed = parse(raw);
  const host = parsed.host?.toLowerCase() ?? '';
  const user = parsed.user ?? '';
  if (!host || host.startsWith('/') || !user || !parsed.database) {
    throw new Error('SEED_DATABASE_URL must include a user, host and database name.');
  }

  const connection: SeedConnection = {
    host,
    port: parsed.port ? Number(parsed.port) : 5432,
    user,
    password: parsed.password,
    database: parsed.database,
    ...(parsed.ssl !== undefined && { ssl: parsed.ssl as boolean | object }),
  };

  if (LOCAL_HOSTS.has(host)) {
    // A pooler-style user (postgres.<ref>) means a tunnel to a Supabase project.
    if (connection.port !== LOCAL_SUPABASE_PORT || user.includes('.')) {
      throw new Error(
        `Refusing to seed ${host}:${connection.port} as ${user}: the only local database allowed is local Supabase on port ${LOCAL_SUPABASE_PORT}.`,
      );
    }
    return { kind: 'local', host, connection };
  }

  const projectRef = supabaseProjectRef(host, user);
  if (!projectRef) {
    throw new Error(
      `Refusing to seed ${host}: only local Supabase and listed Supabase projects are allowed.`,
    );
  }

  if (listFromEnv(env.SEED_BLOCKED_PROJECT_REFS).includes(projectRef)) {
    throw new Error(
      `Refusing to seed ${projectRef}: it is in SEED_BLOCKED_PROJECT_REFS (production).`,
    );
  }

  if (!listFromEnv(env.SEED_ALLOWED_PROJECT_REFS).includes(projectRef)) {
    throw new Error(
      `Refusing to seed ${projectRef}: add it to SEED_ALLOWED_PROJECT_REFS if it is the dev or staging project. Never add production.`,
    );
  }

  return { kind: 'supabase', host, projectRef, connection };
}

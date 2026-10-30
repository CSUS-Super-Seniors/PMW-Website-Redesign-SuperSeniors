import { describe, expect, it } from 'vitest';
import { checkSeedTarget } from './seedTarget.js';

const LOCAL_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const DEV_DIRECT = 'postgresql://postgres:secret@db.devref123.supabase.co:5432/postgres';
const STAGING_POOLER =
  'postgresql://postgres.stagingref456:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres';
const PROD_DIRECT = 'postgresql://postgres:secret@db.prodref789.supabase.co:5432/postgres';
const PROD_POOLER =
  'postgresql://postgres.prodref789:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres';
const LISTS = {
  SEED_ALLOWED_PROJECT_REFS: 'devref123,stagingref456',
  SEED_BLOCKED_PROJECT_REFS: 'prodref789',
};

describe('checkSeedTarget', () => {
  it('allows the local Supabase database and returns the values to connect with', () => {
    expect(checkSeedTarget({ SEED_DATABASE_URL: LOCAL_URL })).toEqual({
      kind: 'local',
      host: '127.0.0.1',
      connection: {
        host: '127.0.0.1',
        port: 54322,
        user: 'postgres',
        password: 'postgres',
        database: 'postgres',
      },
    });
    expect(
      checkSeedTarget({ SEED_DATABASE_URL: 'postgres://postgres@localhost:54322/postgres' }).kind,
    ).toBe('local');
    expect(
      checkSeedTarget({ SEED_DATABASE_URL: 'postgresql://postgres@[::1]:54322/postgres' }).kind,
    ).toBe('local');
  });

  it('refuses a local database on another port, such as a tunnel to a remote database', () => {
    expect(() =>
      checkSeedTarget({ SEED_DATABASE_URL: 'postgresql://postgres@localhost:5432/postgres' }),
    ).toThrow(/port 54322/);
    expect(() =>
      checkSeedTarget({
        SEED_DATABASE_URL: 'postgresql://postgres.prodref789:pw@127.0.0.1:54322/postgres',
      }),
    ).toThrow(/port 54322/);
  });

  it('allows dev and staging projects listed in SEED_ALLOWED_PROJECT_REFS', () => {
    const dev = checkSeedTarget({ ...LISTS, SEED_DATABASE_URL: DEV_DIRECT });
    expect(dev).toMatchObject({ kind: 'supabase', projectRef: 'devref123' });
    expect(dev.connection).toMatchObject({ host: 'db.devref123.supabase.co', user: 'postgres' });

    const staging = checkSeedTarget({ ...LISTS, SEED_DATABASE_URL: STAGING_POOLER });
    expect(staging.projectRef).toBe('stagingref456');
    expect(staging.connection.user).toBe('postgres.stagingref456');
  });

  it('refuses a Supabase project that is not listed, so production is blocked by default', () => {
    expect(() => checkSeedTarget({ SEED_DATABASE_URL: PROD_DIRECT })).toThrow(
      /Refusing to seed prodref789/,
    );
    expect(() => checkSeedTarget({ SEED_DATABASE_URL: PROD_POOLER })).toThrow(
      /Refusing to seed prodref789/,
    );
    expect(() =>
      checkSeedTarget({
        SEED_DATABASE_URL: 'postgresql://postgres:pw@aws-0-us-west-1.pooler.supabase.com/postgres',
        SEED_ALLOWED_PROJECT_REFS: 'postgres',
      }),
    ).toThrow(/Refusing to seed/);
  });

  it('refuses a blocked project even if it is also allowed, however the list is written', () => {
    for (const blocked of [
      'prodref789',
      ' ProdRef789 ',
      '"prodref789"',
      'x; prodref789',
      'https://prodref789.supabase.co',
      'db.prodref789.supabase.co',
    ]) {
      expect(() =>
        checkSeedTarget({
          SEED_DATABASE_URL: PROD_DIRECT,
          SEED_ALLOWED_PROJECT_REFS: 'prodref789',
          SEED_BLOCKED_PROJECT_REFS: blocked,
        }),
      ).toThrow(/SEED_BLOCKED_PROJECT_REFS/);
    }
  });

  it('refuses URL query parameters that would make pg connect somewhere else', () => {
    const bypasses = [
      `${LOCAL_URL}?host=db.prodref789.supabase.co`,
      `${DEV_DIRECT}?host=db.prodref789.supabase.co`,
      `${STAGING_POOLER}?user=postgres.prodref789`,
      `${LOCAL_URL}?hostaddr=10.0.0.1`,
      `${LOCAL_URL}?port=5432`,
      `${STAGING_POOLER}?options=reference%3Dprodref789`,
    ];
    for (const url of bypasses) {
      expect(() => checkSeedTarget({ ...LISTS, SEED_DATABASE_URL: url })).toThrow(
        /Only sslmode is allowed/,
      );
    }
    expect(
      checkSeedTarget({ ...LISTS, SEED_DATABASE_URL: `${DEV_DIRECT}?sslmode=verify-full` })
        .projectRef,
    ).toBe('devref123');
  });

  it('refuses when NODE_ENV is production, even for a local URL', () => {
    for (const nodeEnv of ['production', ' Production ', '"production"']) {
      expect(() => checkSeedTarget({ SEED_DATABASE_URL: LOCAL_URL, NODE_ENV: nodeEnv })).toThrow(
        /NODE_ENV is production/,
      );
    }
  });

  it('refuses to run while PGOPTIONS is set, since the pooler can route by it', () => {
    expect(() =>
      checkSeedTarget({
        ...LISTS,
        SEED_DATABASE_URL: STAGING_POOLER,
        PGOPTIONS: '-c reference=prodref789',
      }),
    ).toThrow(/PGOPTIONS/);
  });

  it('refuses hosts that are not local or Supabase', () => {
    expect(() =>
      checkSeedTarget({
        SEED_DATABASE_URL: 'postgresql://user:pw@db.example.com:5432/app',
        SEED_ALLOWED_PROJECT_REFS: 'db',
      }),
    ).toThrow(/Refusing to seed db.example.com/);
  });

  it('rejects a missing, malformed or incomplete URL', () => {
    expect(() => checkSeedTarget({})).toThrow(/SEED_DATABASE_URL is missing/);
    expect(() => checkSeedTarget({ SEED_DATABASE_URL: '   ' })).toThrow(/missing/);
    expect(() => checkSeedTarget({ SEED_DATABASE_URL: 'not a url' })).toThrow(/postgres/);
    expect(() =>
      checkSeedTarget({ SEED_DATABASE_URL: 'https://db.devref123.supabase.co' }),
    ).toThrow(/postgres/);
    expect(() =>
      checkSeedTarget({ SEED_DATABASE_URL: 'postgresql://127.0.0.1:54322/postgres' }),
    ).toThrow(/user, host and database/);
  });

  it('trims the URL before using it', () => {
    expect(checkSeedTarget({ SEED_DATABASE_URL: `  ${LOCAL_URL}  ` }).connection.database).toBe(
      'postgres',
    );
  });
});

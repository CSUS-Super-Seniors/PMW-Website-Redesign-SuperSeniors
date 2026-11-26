import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createStaffBackend } from '../src/staff.js';
import { createStaffInviteBackend } from '../src/staffInvite.js';
import { createAuthBackend, createSupabaseAdmin } from '../src/supabase.js';

/**
 * The whole Add employee flow (SSPMW-271 / SSPMW-281) against a real local Supabase
 * stack: an owner invites someone through the API, the invite email arrives, its
 * link opens Set password with an invite session, the person saves a password, and
 * then signs in with it and gets the chosen role. Employees and bad input are
 * refused and send nothing.
 *
 * It needs Auth, REST and the local mail viewer, so plain `npm test` skips it
 * unless INVITE_FLOW_SUPABASE_URL is set. CI's invite flow job runs it with
 * `npm run test:invite-flow`. Every account it makes is deleted afterwards.
 */

const url = process.env.INVITE_FLOW_SUPABASE_URL?.trim();
const publishableKey = process.env.INVITE_FLOW_PUBLISHABLE_KEY?.trim();
const serviceRoleKey = process.env.INVITE_FLOW_SERVICE_ROLE_KEY?.trim();
const SITE = 'http://localhost:5173';
const SET_PASSWORD_PAGE = `${SITE}/staff/set-password`;

if (process.env.npm_lifecycle_event === 'test:invite-flow' && !url) {
  throw new Error(
    'Set INVITE_FLOW_SUPABASE_URL, INVITE_FLOW_PUBLISHABLE_KEY and INVITE_FLOW_SERVICE_ROLE_KEY to a local Supabase stack (npx supabase status) to run npm run test:invite-flow.',
  );
}

// It creates and deletes accounts, so it must never point at a hosted project.
if (url) {
  const { protocol, hostname } = new URL(url);
  assert(
    protocol === 'http:' && !/supabase\.(co|in|net)$/.test(hostname),
    'INVITE_FLOW_SUPABASE_URL must be a local Supabase stack, never a hosted project.',
  );
}

const mailUrl =
  process.env.INVITE_FLOW_MAIL_URL?.trim() ||
  (url ? `${new URL(url).protocol}//${new URL(url).hostname}:54324` : '');

type MailSearch = { messages?: { ID: string }[] };
type MailMessage = { HTML?: string; Text?: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson<T>(target: string): Promise<T> {
  const response = await fetch(target, { signal: AbortSignal.timeout(10_000) });
  assert(response.ok, `${target} answered ${response.status}`);
  return (await response.json()) as T;
}

async function mailFor(email: string): Promise<{ ID: string }[]> {
  const query = encodeURIComponent(`to:"${email}"`);
  return (await getJson<MailSearch>(`${mailUrl}/api/v1/search?query=${query}`)).messages ?? [];
}

/**
 * Waits until `count` invite emails reached the local mail viewer and returns the
 * newest one's link. The link uses the stack's own API address (127.0.0.1 on the
 * machine running it), so point it at INVITE_FLOW_SUPABASE_URL instead.
 */
async function readInviteLink(email: string, count = 1): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const messages = await mailFor(email);
    const id = messages.length >= count ? messages[0]?.ID : undefined;
    if (id) {
      const message = await getJson<MailMessage>(`${mailUrl}/api/v1/message/${id}`);
      const body = `${message.HTML ?? ''}\n${message.Text ?? ''}`.replace(/&amp;/g, '&');
      const link = /https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/.exec(body)?.[0];
      assert(link, 'The invite email has no link.');
      const reachable = new URL(link);
      const stack = new URL(url!);
      reachable.protocol = stack.protocol;
      reachable.host = stack.host;
      return reachable.toString();
    }
    await sleep(500);
  }
  throw new Error(`No invite email for ${email} reached ${mailUrl}.`);
}

/** Opens the emailed link the way a browser would and returns where Supabase sends it. */
async function followLink(link: string): Promise<URL> {
  const response = await fetch(link, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  const location = response.headers.get('location');
  assert(location, `The invite link did not redirect (status ${response.status}).`);
  return new URL(location);
}

function userIdFromToken(token: string): string {
  return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')).sub;
}

describe.skipIf(!url)('staff invite through set-password and sign-in (SSPMW-281)', () => {
  let admin: SupabaseClient;
  let app: ReturnType<typeof createApp>;
  const createdUserIds: string[] = [];
  const tokens = { owner: '', employee: '' };
  const run = randomUUID().slice(0, 8);
  const invitedEmail = `invite-flow-${run}@example.com`;
  const refusedEmail = `invite-refused-${run}@example.com`;
  const browser = () =>
    createClient(url!, publishableKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: 'implicit',
      },
    });

  async function accountExists(email: string) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    assert(!error, error?.message);
    return data.users.some((user) => user.email === email);
  }

  /** A signed-in staff member made directly with the Admin API, for calling the route. */
  async function staffToken(role: 'owner' | 'employee') {
    const email = `invite-flow-${role}-${run}@example.com`;
    const password = `pw-${randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert(!error && data.user, `Could not create the ${role}: ${error?.message}`);
    createdUserIds.push(data.user.id);
    const { error: profileError } = await admin
      .from('staff_profiles')
      .insert({ id: data.user.id, full_name: `Flow ${role}`, role, status: 'active' });
    assert(!profileError, `Could not add the ${role} profile: ${profileError?.message}`);
    const signedIn = await browser().auth.signInWithPassword({ email, password });
    assert(signedIn.data.session, `The ${role} could not sign in.`);
    return signedIn.data.session.access_token;
  }

  beforeAll(async () => {
    assert(publishableKey && serviceRoleKey, 'Set the INVITE_FLOW keys too.');
    const config = loadConfig({
      CLIENT_ORIGINS: SITE,
      SUPABASE_URL: url,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      OWNER_PORTAL_ORIGIN: SITE,
    });
    admin = createSupabaseAdmin(config);
    app = createApp(config, createAuthBackend(config, admin), undefined, {
      staff: createStaffBackend(admin),
      staffInvite: createStaffInviteBackend(admin, { ownerPortalOrigin: SITE }),
    });
    tokens.owner = await staffToken('owner');
    tokens.employee = await staffToken('employee');
  });

  afterAll(async () => {
    const { data } = admin ? await admin.auth.admin.listUsers({ perPage: 1000 }) : { data: null };
    for (const user of data?.users ?? []) {
      if ([invitedEmail, refusedEmail].includes(user.email ?? '')) createdUserIds.push(user.id);
    }
    // Deleting the account also deletes its staff_profiles row (on delete cascade).
    for (const id of new Set(createdUserIds)) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) console.error(`Could not delete test account ${id}: ${error.message}`);
    }
  });

  const invite = (token: string, body: object) =>
    request(app).post('/api/staff/invite').set('Authorization', `Bearer ${token}`).send(body);

  it('refuses an employee and sends no invite', async () => {
    await invite(tokens.employee, {
      fullName: 'Refused',
      email: refusedEmail,
      role: 'owner',
    }).expect(403);
    assert.equal(await accountExists(refusedEmail), false);
    assert.equal((await mailFor(refusedEmail)).length, 0, 'An email went out anyway.');
  });

  it('refuses missing fields and an invalid email and sends no invite', async () => {
    const missing = await invite(tokens.owner, { fullName: '', email: '', role: '' }).expect(400);
    assert.deepEqual(Object.keys(missing.body.fieldErrors).sort(), ['email', 'fullName', 'role']);
    const invalid = await invite(tokens.owner, {
      fullName: 'Refused',
      email: refusedEmail.replace('@', ''),
      role: 'employee',
    }).expect(400);
    assert.deepEqual(Object.keys(invalid.body.fieldErrors), ['email']);
    assert.equal(await accountExists(refusedEmail), false);
  });

  it('invites, opens Set password, saves a password, and signs in with the chosen role', async () => {
    const response = await invite(tokens.owner, {
      fullName: 'Flow Invitee',
      email: invitedEmail.toUpperCase(),
      role: 'employee',
    }).expect(201);
    const invited = response.body.staff;
    assert.deepEqual(
      { ...invited, id: undefined },
      {
        id: undefined,
        fullName: 'Flow Invitee',
        email: invitedEmail,
        role: 'employee',
        lastLoginAt: null,
        status: 'active',
      },
    );

    const list = await request(app)
      .get('/api/staff')
      .set('Authorization', `Bearer ${tokens.owner}`)
      .expect(200);
    assert.ok(
      list.body.staff.some(
        (row: { id: string; role: string }) => row.id === invited.id && row.role === 'employee',
      ),
      'The invited person is not on the Staff accounts list.',
    );

    // A second invite before they set a password sends a new link (which replaces
    // the first) and keeps the profile: still Flow Invitee, still an employee.
    await readInviteLink(invitedEmail);
    const again = await invite(tokens.owner, {
      fullName: 'Someone Else',
      email: invitedEmail,
      role: 'owner',
    }).expect(201);
    assert.equal(again.body.resent, true);
    assert.deepEqual(again.body.staff, invited);

    const link = await readInviteLink(invitedEmail, 2);
    const landing = await followLink(link);
    const hash = new URLSearchParams(landing.hash.slice(1));
    assert.equal(
      `${landing.origin}${landing.pathname}`,
      SET_PASSWORD_PAGE,
      'The invite link did not open Set password. Is it in [auth] additional_redirect_urls?',
    );
    assert.equal(hash.get('type'), 'invite');
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    assert(accessToken && refreshToken, 'The invite link did not carry a session.');
    assert.equal(userIdFromToken(accessToken), invited.id, 'The link is for the wrong account.');

    // What the Set password page does: use the link's session, save, sign out.
    const visitor = browser();
    const { error: sessionError } = await visitor.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    assert(!sessionError, sessionError?.message);
    const tooShort = await visitor.auth.updateUser({ password: 'seven77' });
    assert.equal(tooShort.error?.code, 'weak_password', 'A 7-character password was accepted.');
    const password = `set-${randomUUID()}`;
    const { error: updateError } = await visitor.auth.updateUser({ password });
    assert(!updateError, `Saving the password failed: ${updateError?.message}`);
    await visitor.auth.signOut({ scope: 'local' });

    const signedIn = await browser().auth.signInWithPassword({ email: invitedEmail, password });
    assert(signedIn.data.session, `Could not sign in: ${signedIn.error?.message}`);
    const me = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${signedIn.data.session.access_token}`)
      .expect(200);
    assert.deepEqual(me.body, { userId: invited.id, role: 'employee', status: 'active' });
    // The chosen role is enforced: an employee cannot open owner routes.
    await request(app)
      .get('/api/staff')
      .set('Authorization', `Bearer ${signedIn.data.session.access_token}`)
      .expect(403);

    const reused = await followLink(link);
    const reusedParams = new URLSearchParams(`${reused.hash.slice(1)}&${reused.search.slice(1)}`);
    assert(reusedParams.get('error_code'), 'A used invite link still worked.');
  });

  it('refuses an invite to someone who already set a password', async () => {
    const response = await invite(tokens.owner, {
      fullName: 'Flow Invitee',
      email: invitedEmail,
      role: 'owner',
    }).expect(409);
    assert.ok(response.body.fieldErrors.email);
  });
});

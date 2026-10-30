import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadConfig } from '../src/config.js';
import { createSupabaseAdmin } from '../src/supabase.js';

/**
 * End-to-end check of the staff password reset (SSPMW-299) against local
 * Supabase: the reset email arrives, its link opens the Reset password page
 * with a recovery session, the new password works for sign-in, the old one
 * stops working, and the used link shows as expired.
 *
 * Run with `npm run verify:password-reset` after `npm run db:start`.
 */

const RESET_PAGE = 'http://localhost:5173/staff/reset-password';
// Local Supabase's email viewer (Mailpit), from `[local_smtp] port` in supabase/config.toml.
const MAIL_URL = process.env.LOCAL_MAIL_URL ?? 'http://127.0.0.1:54324';

type MailSummary = { ID: string };
type MailSearch = { messages?: MailSummary[] };
type MailMessage = { HTML?: string; Text?: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  assert(response.ok, `${url} answered ${response.status}`);
  return (await response.json()) as T;
}

/** Waits for the reset email to reach the local mail viewer and returns its link. */
async function readResetEmailLink(email: string): Promise<string> {
  const query = encodeURIComponent(`to:"${email}"`);
  for (let attempt = 0; attempt < 20; attempt++) {
    const found = await getJson<MailSearch>(`${MAIL_URL}/api/v1/search?query=${query}`);
    const id = found.messages?.[0]?.ID;
    if (id) {
      const message = await getJson<MailMessage>(`${MAIL_URL}/api/v1/message/${id}`);
      const body = `${message.HTML ?? ''}\n${message.Text ?? ''}`.replace(/&amp;/g, '&');
      const link = /https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/.exec(body)?.[0];
      assert(link, 'The reset email has no reset link.');
      return link;
    }
    await sleep(500);
  }
  throw new Error(`No reset email for ${email} reached ${MAIL_URL}.`);
}

/** Opens the emailed link the way a browser would and returns where Supabase sends it. */
async function followLink(link: string): Promise<URL> {
  const response = await fetch(link, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
  const location = response.headers.get('location');
  assert(location, `The reset link did not redirect (status ${response.status}).`);
  return new URL(location);
}

function userIdFromToken(token: string): string {
  const payload = token.split('.')[1] ?? '';
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).sub;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  assert(url, 'SUPABASE_URL is missing.');
  assert(publishableKey, 'Local SUPABASE_PUBLISHABLE_KEY is missing.');
  assert(
    ['127.0.0.1', 'localhost'].includes(new URL(url).hostname),
    'This verification script must target local Supabase.',
  );

  const admin = createSupabaseAdmin(loadConfig());
  const browser = () =>
    createClient(url, publishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: 'implicit',
      },
    });

  const email = `reset-check-${randomUUID()}@example.com`;
  const oldPassword = `old-${randomUUID()}`;
  const newPassword = `new-${randomUUID()}`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: oldPassword,
    email_confirm: true,
  });
  assert(!createError && created.user, `Could not create the test user: ${createError?.message}`);
  const userId = created.user.id;

  try {
    const visitor = browser();
    const { error: requestError } = await visitor.auth.resetPasswordForEmail(email, {
      redirectTo: RESET_PAGE,
    });
    assert(!requestError, `Reset request failed: ${requestError?.message}`);

    const link = await readResetEmailLink(email);
    console.log('PASS: reset email arrived with a reset link');

    const landing = await followLink(link);
    const hash = new URLSearchParams(landing.hash.slice(1));
    assert.equal(`${landing.origin}${landing.pathname}`, RESET_PAGE, 'Link opened the wrong page.');
    assert.equal(hash.get('type'), 'recovery', 'Link is not a recovery link.');
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    assert(accessToken && refreshToken, 'Link did not carry a session.');
    assert.equal(userIdFromToken(accessToken), userId, 'Link is for the wrong account.');
    console.log('PASS: link opens /staff/reset-password with a recovery session');

    const { error: sessionError } = await visitor.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    assert(!sessionError, `Could not use the recovery session: ${sessionError?.message}`);

    const tooShort = await visitor.auth.updateUser({ password: 'seven77' });
    assert.equal(tooShort.error?.code, 'weak_password', 'A 7-character password was accepted.');
    const same = await visitor.auth.updateUser({ password: oldPassword });
    assert.equal(same.error?.code, 'same_password', 'Reusing the current password was accepted.');
    console.log('PASS: short and unchanged passwords are refused (weak_password, same_password)');

    const { error: updateError } = await visitor.auth.updateUser({ password: newPassword });
    assert(!updateError, `Saving the new password failed: ${updateError?.message}`);
    const { error: signOutError } = await visitor.auth.signOut({ scope: 'local' });
    assert(!signOutError, `Signing out the reset session failed: ${signOutError?.message}`);

    const withNew = await browser().auth.signInWithPassword({ email, password: newPassword });
    assert(!withNew.error && withNew.data.session, 'Could not sign in with the new password.');
    const withOld = await browser().auth.signInWithPassword({ email, password: oldPassword });
    assert(withOld.error, 'The old password still works.');
    console.log('PASS: the new password signs in and the old one does not');

    const reused = await followLink(link);
    const reusedParams = new URLSearchParams(`${reused.hash.slice(1)}&${reused.search.slice(1)}`);
    assert(reusedParams.get('error_code'), 'A used link did not come back as expired.');
    console.log(`PASS: a used link comes back as ${reusedParams.get('error_code')}`);
  } finally {
    // Log instead of throwing so a cleanup problem never hides the real failure.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error(`Could not delete the test user ${email}: ${error.message}`);
  }

  console.log('All password reset checks passed.');
}

main().catch((error: unknown) => {
  console.error('FAIL:', error instanceof Error ? error.message : 'Unexpected verification error.');
  process.exitCode = 1;
});

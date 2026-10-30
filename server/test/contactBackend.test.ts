import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createContactBackend, type SavedContactMessage } from '../src/contact.js';
import { loadConfig } from '../src/config.js';

const message: SavedContactMessage = {
  id: 'message-1',
  created_at: '2026-10-29T12:00:00Z',
  name: 'Zoë 李',
  phone: '9165550123',
  email: 'zoe@example.com',
  message: 'Can you repair this?\n<script>alert("hello")</script>',
};
const email = {
  apiKey: 'test-resend-secret',
  from: 'contact@pmw.example',
  to: ['todd@example.com', 'girlie@example.com'],
};

function setup() {
  const single = vi.fn().mockResolvedValue({
    data: { id: message.id, created_at: message.created_at },
    error: null,
  });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const from = vi.fn().mockReturnValue({ insert });
  const fetchEmail = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: 'email-1' }));
  const backend = createContactBackend(
    { from } as unknown as Pick<SupabaseClient, 'from'>,
    email,
    fetchEmail,
  );
  return { backend, from, insert, select, single, fetchEmail };
}

describe('contact database adapter', () => {
  it('inserts the validated fields and lets the database assign id and created_at', async () => {
    const { backend, from, insert, select } = setup();
    const input = {
      name: message.name,
      phone: message.phone,
      email: message.email,
      message: message.message,
    };
    expect(await backend.saveMessage(input)).toEqual(message);
    expect(from).toHaveBeenCalledExactlyOnceWith('contact_messages');
    expect(insert).toHaveBeenCalledExactlyOnceWith(input);
    expect(select).toHaveBeenCalledExactlyOnceWith('id,created_at');
  });

  it.each([
    { data: null, error: { message: 'private database detail' } },
    { data: null, error: null },
    { data: { id: 'message-1' }, error: null },
  ])('refuses failed or incomplete insert responses: %j', async (result) => {
    const { backend, single } = setup();
    single.mockResolvedValueOnce(result);
    await expect(backend.saveMessage(message)).rejects.toThrow(
      'Contact message could not be saved.',
    );
  });
});

describe('Resend contact notification', () => {
  it('sends N6 to both configured owners as plain text with the visitor in Reply-To', async () => {
    const { backend, fetchEmail } = setup();
    await backend.sendNotification(message);
    expect(fetchEmail).toHaveBeenCalledTimes(1);
    const [url, options] = fetchEmail.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(options?.method).toBe('POST');
    expect(options?.headers).toEqual({
      Authorization: 'Bearer test-resend-secret',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'contact-message/message-1',
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(options?.body as string);
    expect(body).toMatchObject({
      from: email.from,
      to: email.to,
      subject: 'New contact message',
      reply_to: message.email,
    });
    expect(body.html).toBeUndefined();
    for (const value of [
      message.name,
      message.phone,
      message.email,
      message.message,
      message.created_at,
    ]) {
      expect(body.text).toContain(value);
    }
  });

  it('supports phone-only submissions without an invalid Reply-To', async () => {
    const { backend, fetchEmail } = setup();
    await backend.sendNotification({ ...message, email: null });
    const body = JSON.parse(fetchEmail.mock.calls[0][1]?.body as string);
    expect(body.reply_to).toBeUndefined();
    expect(body.text).toContain('Email: Not provided');
  });

  it.each([400, 401, 429, 500, 503])('rejects a Resend HTTP %i response', async (status) => {
    const { backend, fetchEmail } = setup();
    fetchEmail.mockResolvedValueOnce(
      Response.json({ message: 'private provider detail' }, { status }),
    );
    await expect(backend.sendNotification(message)).rejects.toThrow(
      'Contact notification could not be sent.',
    );
  });

  it.each([{}, { id: '' }, { id: 42 }, null])(
    'rejects incomplete success responses: %j',
    async (body) => {
      const { backend, fetchEmail } = setup();
      fetchEmail.mockResolvedValueOnce(Response.json(body));
      await expect(backend.sendNotification(message)).rejects.toThrow(
        'Contact notification was not acknowledged.',
      );
    },
  );

  it('rejects a malformed JSON success response', async () => {
    const { backend, fetchEmail } = setup();
    fetchEmail.mockResolvedValueOnce(new Response('{'));
    await expect(backend.sendNotification(message)).rejects.toBeInstanceOf(SyntaxError);
  });

  it('propagates network errors, including timeouts, to the route failure handler', async () => {
    const { backend, fetchEmail } = setup();
    fetchEmail.mockRejectedValueOnce(new DOMException('Timed out', 'TimeoutError'));
    await expect(backend.sendNotification(message)).rejects.toThrow('Timed out');
  });
});

describe('contact email configuration', () => {
  const env = {
    CLIENT_ORIGINS: 'http://localhost:5173',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
  };
  const emailEnv = {
    RESEND_API_KEY: ' test-key ',
    RESEND_FROM_EMAIL: 'contact@pmw.example',
    CONTACT_OWNER_EMAILS: ' todd@example.com, girlie@example.com, todd@example.com ',
  };

  it('allows existing non-contact routes when no email settings are supplied', () => {
    expect(loadConfig(env).contactEmail).toBeUndefined();
  });

  it('requires all email settings together and refuses malformed mailboxes', () => {
    expect(() => loadConfig({ ...env, RESEND_API_KEY: 'test-key' })).toThrow(
      'Missing contact email',
    );
    for (const bad of ['not-email', ', ,', 'a@example.com\r\nBcc: x@example.com']) {
      expect(() => loadConfig({ ...env, ...emailEnv, CONTACT_OWNER_EMAILS: bad })).toThrow(
        'bare email addresses',
      );
    }
    expect(() => loadConfig({ ...env, ...emailEnv, RESEND_FROM_EMAIL: 'bad' })).toThrow(
      'bare email addresses',
    );
  });

  it('ignores empty entries and trailing commas in the owner list', () => {
    expect(
      loadConfig({
        ...env,
        ...emailEnv,
        CONTACT_OWNER_EMAILS: ' todd@example.com, ,girlie@example.com, ',
      }).contactEmail?.to,
    ).toEqual(['todd@example.com', 'girlie@example.com']);
  });

  it('trims settings and sends only once per configured owner address', () => {
    expect(loadConfig({ ...env, ...emailEnv }).contactEmail).toEqual({
      apiKey: 'test-key',
      from: emailEnv.RESEND_FROM_EMAIL,
      to: ['todd@example.com', 'girlie@example.com'],
    });
  });
});

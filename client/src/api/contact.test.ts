import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContactValidationError, sendContactMessage, type ContactMessage } from './contact';

const message: ContactMessage = {
  name: 'Alex',
  email: 'alex@example.com',
  phone: null,
  message: 'Can you repair my table?',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('sendContactMessage', () => {
  it('posts the payload and accepts a successful response without a JSON body', async () => {
    vi.stubEnv('DEV', false);
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);

    await expect(sendContactMessage(message)).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/contact-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
  });

  it('accepts receipt after the server logs a notification failure', async () => {
    vi.stubEnv('DEV', false);
    const fetch = vi.fn().mockResolvedValue(Response.json({ success: true }, { status: 201 }));
    vi.stubGlobal('fetch', fetch);
    await expect(sendContactMessage(message)).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves recognized validation fields for the form and ignores unknown ones', async () => {
    vi.stubEnv('DEV', false);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            fieldErrors: {
              email: 'Enter a valid email address.',
              message: 'Too long.',
              extra: 'Ignore',
            },
          },
          { status: 400 },
        ),
      ),
    );
    await expect(sendContactMessage(message)).rejects.toMatchObject({
      name: 'ContactValidationError',
      fieldErrors: { email: 'Enter a valid email address.', message: 'Too long.' },
    });
  });

  it.each([null, { fieldErrors: null }, { fieldErrors: { email: ['Wrong type'] } }])(
    'uses a general error when validation details are missing or malformed: %j',
    async (body) => {
      vi.stubEnv('DEV', false);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body, { status: 400 })));
      await expect(sendContactMessage(message)).rejects.not.toBeInstanceOf(ContactValidationError);
    },
  );

  it.each([400, 404, 429, 500])('rejects HTTP %s without reporting success', async (status) => {
    vi.stubEnv('DEV', false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })));
    await expect(sendContactMessage(message)).rejects.toThrow();
  });

  it('propagates connection failures to the form', async () => {
    vi.stubEnv('DEV', false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network down')));
    await expect(sendContactMessage(message)).rejects.toThrow('Network down');
  });

  it.each(['success', 'failure'])('ignores the %s stub in production', async (stub) => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('VITE_CONTACT_FORM_STUB', stub);
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    await expect(sendContactMessage(message)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['success', 'failure'])(
    'supports the development %s preview without a request',
    async (stub) => {
      vi.useFakeTimers();
      vi.stubEnv('DEV', true);
      vi.stubEnv('VITE_CONTACT_FORM_STUB', stub);
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const outcome = sendContactMessage(message).then(
        () => 'sent',
        () => 'failed',
      );
      await vi.runAllTimersAsync();

      expect(await outcome).toBe(stub === 'success' ? 'sent' : 'failed');
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { loadConfig } from '../src/config.js';
import {
  buildDeclineEmail,
  createDeclineEmailFromConfig,
  createDeclineEmailSender,
  notifyCustomerOfDecline,
  type DeclineEmailSender,
  type DeclinedInquiry,
} from '../src/declineEmail.js';

const inquiry: DeclinedInquiry = {
  id: '5eed0003-0000-4000-8000-000000001048',
  inquiry_number: 'INQ-1048',
  first_name: 'Margaret',
  item: 'Dining chair',
  email: 'margaret@example.com',
};
const emailConfig = {
  apiKey: 'test-email-key',
  from: 'estimates@example.com',
  replyTo: ['owner@example.com'],
};
const accepted = () => Response.json({ id: 'email-1' });

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => errorLog.mockRestore());

describe('buildDeclineEmail', () => {
  it('includes the first name, inquiry number, item and business phone', () => {
    const { subject, text } = buildDeclineEmail(inquiry);
    expect(subject).toBe('Your estimate request INQ-1048');
    expect(text).toContain('Hi Margaret,');
    expect(text).toContain('your Dining chair');
    expect(text).toContain('(INQ-1048)');
    expect(text).toContain('(916) 643-5686');
    expect(text).toContain('Peterson Mobile Woodworking');
  });

  it('never includes internal notes or other inquiry fields', () => {
    const withNotes = {
      ...inquiry,
      description: 'Customer description',
      notes: 'INTERNAL: price shopper, do not take',
      phone: '(916) 555-0142',
      address: '4821 Fair Oaks Blvd',
    } as DeclinedInquiry;
    const { subject, text } = buildDeclineEmail(withNotes);
    for (const value of ['INTERNAL', 'Customer description', '555-0142', 'Fair Oaks Blvd'])
      expect(`${subject}\n${text}`).not.toContain(value);
  });

  it('keeps customer text on one line so it cannot add lines or headers', () => {
    const { subject, text } = buildDeclineEmail({
      ...inquiry,
      first_name: 'Ana\r\nBcc: Todd',
      item: '  Oak\n\n  table  ',
      inquiry_number: 'INQ-1\r\n2',
    });
    expect(subject).toBe('Your estimate request INQ-1 2');
    expect(text.split('\n')[0]).toBe('Hi Ana Bcc: Todd,');
    expect(text).toContain('your Oak table.');
  });

  it.each([
    ['https://spam.example/win', 'Oak table'],
    ['Ana', 'chair, see www.spam.example'],
    ['Ana', 'chair spam.shop'],
    ['Ana', 'chair, see bit.ly/spam'],
    ['Ana', 'chair spam.co.uk'],
    ['Ana', 'win at spam.furniture'],
    ['Ana', 'see spam.com.2 now'],
    ['Ana', 'see spam.com.unit now'],
    ['Ana', 'chair, email me at win@spam.example'],
    ['Visit spam.ru now', 'chair'],
    ['Ana', 'ftp://spam.example'],
    ['Ana', 'refund? call 1-888-555-0199'],
    ['Call +1 (888) 555-0199', 'chair'],
    ['Ana', 'tel:18885550199'],
    ['Ana', '192.168.10.20/login'],
    ['Ana', 'пример.рф'],
    ['Ana', 'spam．com'],
    ['Ana', 'ｓｐａｍ．ｃｏｍ'],
    ['Ana', 'spam。com'],
    ['Ana', 'spam_site.com'],
    ['Ana', 'javascript:alert(1)'],
    ['Ana', 'mailto:a'],
    ['Ana', 'data:text/html,hi'],
    ['Ana', 'spam\u00ad.com refund'],
    ['Ana', 'spam\u200b.com refund'],
    ['Ana', 'spam.\u200bcom refund'],
    ['Ana', 'spam\u2060.com refund'],
    ['Ana', 'call 888\u200b555\u200b0199'],
    ['Ana', 'call 888/555/0199'],
    ['Ana', 'call 888_555_0199'],
    ['Ana', 'call 888\u00b7555\u00b70199'],
    ['Ana', 'call 888|555|0199'],
    ['Ana', 'sms:8885550199'],
  ])('never repeats link-like customer text (%j, %j)', (first_name, item) => {
    const { text } = buildDeclineEmail({ ...inquiry, first_name, item });
    expect(text).not.toMatch(/spam|555|1888|192\.168|пример|javascript|mailto|data:|sms:/i);
    expect(text).toContain('(INQ-1048)');
  });

  it('replaces a long name or item with a plain word', () => {
    const { text } = buildDeclineEmail({
      ...inquiry,
      first_name: 'A'.repeat(41),
      item: 'B'.repeat(61),
    });
    expect(text).toContain('Hi there,');
    expect(text).toContain('your item.');
    expect(buildDeclineEmail({ ...inquiry, item: 'B'.repeat(60) }).text).toContain('B'.repeat(60));
  });

  it.each([
    ['Zoë', 'Oak table'],
    ['Ana', 'St. Helena rocking chair'],
    ['Ana', '3.5 ft bookshelf'],
    ['Ana', 'Re: chair from 1998, 2004'],
    ['Ana', 'Table 120 x 60 x 75 cm'],
    ['Ana', 'Size:3ft table'],
    ['Ana', 'Chair: oak, 8:00 AM pickup'],
    ['José', 'Mesa de comedor'],
    // A dot between words is only a link when the ending is a real top-level domain.
    ['Mr.Smith', 'Oak table'],
    ['Ana', 'shelf.unit'],
    ['Ana', 'St.Louis rocking chair'],
    ['Dr.Who', 'J.R.R. bookshelf'],
    ['Ana', 'v1.2 chair'],
  ])('keeps ordinary text that only looks a little like a link (%j, %j)', (first_name, item) => {
    const { text } = buildDeclineEmail({ ...inquiry, first_name, item });
    expect(text).toContain(`Hi ${first_name},`);
    expect(text).toContain(`your ${item}.`);
  });

  it('keeps ordinary names and items with punctuation', () => {
    const { text } = buildDeclineEmail({
      ...inquiry,
      first_name: "D'Angelo-Marie",
      item: 'Mid-century oak dresser (3 drawers)',
    });
    expect(text).toContain("Hi D'Angelo-Marie,");
    expect(text).toContain('your Mid-century oak dresser (3 drawers).');
  });

  it('falls back to friendly words when a name or item is blank', () => {
    const { text } = buildDeclineEmail({ ...inquiry, first_name: '  ', item: '' });
    expect(text).toContain('Hi there,');
    expect(text).toContain('your item.');
  });
});

describe('createDeclineEmailSender', () => {
  it('sends a plain-text email through Resend to the address on the inquiry', async () => {
    const fetchEmail = vi.fn<typeof fetch>(async () => accepted());
    await createDeclineEmailSender(emailConfig, fetchEmail).send({
      ...inquiry,
      email: '  Margaret@Example.com ',
    });

    expect(fetchEmail).toHaveBeenCalledTimes(1);
    const [url, init] = fetchEmail.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer test-email-key',
      'Content-Type': 'application/json',
      'Idempotency-Key': `inquiry-declined/${inquiry.id}`,
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      from: 'estimates@example.com',
      to: ['Margaret@Example.com'],
      reply_to: ['owner@example.com'],
      ...buildDeclineEmail(inquiry),
    });
    expect(body).not.toHaveProperty('html');
  });

  it('resolves sent when Resend accepts the email', async () => {
    const sender = createDeclineEmailSender(emailConfig, async () => accepted());
    await expect(sender.send(inquiry)).resolves.toBe('sent');
  });

  it.each(['invalid_idempotent_request', 'concurrent_idempotent_requests'])(
    'treats a 409 %s as already sent, not a failure',
    async (name) => {
      const sender = createDeclineEmailSender(emailConfig, async () =>
        Response.json({ name, message: 'duplicate' }, { status: 409 }),
      );
      await expect(sender.send(inquiry)).resolves.toBe('already_sent');
    },
  );

  it.each([
    () => Response.json({ name: 'validation_error' }, { status: 409 }),
    () => new Response('not json', { status: 409 }),
  ])('still fails on any other 409', async (response) => {
    const sender = createDeclineEmailSender(emailConfig, async () => response());
    await expect(sender.send(inquiry)).rejects.toThrow('could not be sent');
  });

  it('leaves reply_to out when no owner addresses are set', async () => {
    const fetchEmail = vi.fn<typeof fetch>(async () => accepted());
    await createDeclineEmailSender({ apiKey: 'k', from: 'a@example.com' }, fetchEmail).send(
      inquiry,
    );
    expect(JSON.parse(String(fetchEmail.mock.calls[0]![1]?.body))).not.toHaveProperty('reply_to');
  });

  it.each([
    () => Response.json({ message: 'invalid' }, { status: 422 }),
    () => Response.json({}),
    () => Response.json({ id: ' ' }),
  ])('throws when Resend does not accept the email', async (response) => {
    const sender = createDeclineEmailSender(emailConfig, async () => response());
    await expect(sender.send(inquiry)).rejects.toThrow();
  });

  it.each([null, '', 'not-an-email', 'a@b'])(
    'never calls Resend without a usable address (%j)',
    async (email) => {
      const fetchEmail = vi.fn<typeof fetch>();
      await expect(
        createDeclineEmailSender(emailConfig, fetchEmail).send({ ...inquiry, email }),
      ).rejects.toThrow('no usable email address');
      expect(fetchEmail).not.toHaveBeenCalled();
    },
  );
});

describe('notifyCustomerOfDecline', () => {
  it('reports a sent email', async () => {
    const sender = { send: vi.fn(async () => 'sent' as const) };
    await expect(notifyCustomerOfDecline(sender, inquiry)).resolves.toBe('sent');
    expect(sender.send).toHaveBeenCalledExactlyOnceWith(inquiry);
  });

  it('reports an email Resend had already sent', async () => {
    const sender = { send: vi.fn(async () => 'already_sent' as const) };
    await expect(notifyCustomerOfDecline(sender, inquiry)).resolves.toBe('already_sent');
  });

  it('never throws when sending fails, and logs only the inquiry id', async () => {
    const sender = { send: vi.fn().mockRejectedValue(new Error('Resend: margaret@example.com')) };
    await expect(notifyCustomerOfDecline(sender, inquiry)).resolves.toBe('failed');
    expect(errorLog).toHaveBeenCalledWith('Decline email failed', { inquiryId: inquiry.id });
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('margaret');
  });

  it('skips inquiries without an email address and an unconfigured sender', async () => {
    const sender = { send: vi.fn() };
    await expect(notifyCustomerOfDecline(sender, { ...inquiry, email: null })).resolves.toBe(
      'no_email',
    );
    await expect(notifyCustomerOfDecline(undefined, inquiry)).resolves.toBe('unavailable');
    expect(sender.send).not.toHaveBeenCalled();
  });
});

describe('createDeclineEmailFromConfig', () => {
  const env = {
    CLIENT_ORIGINS: 'http://localhost:5173',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
  };

  it('uses the Resend settings and sends replies to the owners', async () => {
    const fetchEmail = vi.fn<typeof fetch>(async () => accepted());
    const config = loadConfig({
      ...env,
      RESEND_API_KEY: 'resend-key',
      RESEND_FROM_EMAIL: 'contact@example.com',
      CONTACT_OWNER_EMAILS: 'girlie@example.com,todd@example.com',
    });
    await createDeclineEmailFromConfig(config, fetchEmail)!.send(inquiry);
    const body = JSON.parse(String(fetchEmail.mock.calls[0]![1]?.body));
    expect(body.from).toBe('contact@example.com');
    expect(body.reply_to).toEqual(['girlie@example.com', 'todd@example.com']);
    expect(fetchEmail.mock.calls[0]![1]?.headers).toMatchObject({
      Authorization: 'Bearer resend-key',
    });
  });

  it('is unavailable when email is not configured', () => {
    expect(createDeclineEmailFromConfig(loadConfig(env))).toBeUndefined();
  });
});

describe('decline flow contract (how SSPMW-172 uses this)', () => {
  /**
   * Stand-in for the decline route, saving the status first and then emailing. These
   * tests show the helper's side of the contract (it never rejects), so a route that
   * saves first stays saved. The real route and its tests come with SSPMW-172.
   */
  function declineApp(sender: DeclineEmailSender) {
    const statuses = new Map([[inquiry.id, 'new']]);
    const app = express();
    app.post('/inquiries/:id/decline', async (req, res) => {
      statuses.set(req.params.id, 'closed');
      const email = await notifyCustomerOfDecline(sender, inquiry);
      res.json({ status: statuses.get(req.params.id), email });
    });
    return { app, statuses };
  }

  it('reports the email to a route that saved the decline first', async () => {
    const send = vi.fn(async () => 'sent' as const);
    const { app } = declineApp({ send });
    const response = await request(app).post(`/inquiries/${inquiry.id}/decline`).expect(200);
    expect(response.body).toEqual({ status: 'closed', email: 'sent' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never rejects when the email fails, so a route that saved first keeps Declined', async () => {
    const { app, statuses } = declineApp({ send: vi.fn().mockRejectedValue(new Error('down')) });
    const response = await request(app).post(`/inquiries/${inquiry.id}/decline`).expect(200);
    expect(response.body).toEqual({ status: 'closed', email: 'failed' });
    expect(statuses.get(inquiry.id)).toBe('closed');
  });
});

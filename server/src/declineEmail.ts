import { businessContact } from '@pmw/validation';
import type { Config } from './config.js';

/** The inquiry fields the decline email may use. Internal notes are never passed in. */
export interface DeclinedInquiry {
  id: string;
  inquiry_number: string;
  first_name: string;
  item: string;
  /** The address on that inquiry, as the customer typed it. */
  email: string | null;
}

export interface DeclineEmailConfig {
  apiKey: string;
  /** Bare address on the domain verified in Resend. */
  from: string;
  /** Owner addresses, so a customer's reply reaches Girlie and Todd. */
  replyTo?: string[];
}

export interface DeclineEmailSender {
  /** `already_sent` means Resend had already sent this decline's email. */
  send(inquiry: DeclinedInquiry): Promise<'sent' | 'already_sent'>;
}

/**
 * Resend's 409 replies for a reused idempotency key: the email for this decline was
 * already sent with different details, or is being sent by a request still running.
 * Either way the customer has (or is getting) the email, so it isn't a failure.
 */
const ALREADY_SENT_ERRORS = new Set([
  'invalid_idempotent_request',
  'concurrent_idempotent_requests',
]);

const MAILBOX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Customer text goes in a plain-text email on one line, so it can't add headers or markup. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

// Things a mail app could turn into a link. Checked after NFKC normalization, so
// full-width letters and dots count too.
const LINK_PATTERNS = [
  /\b[a-z][a-z0-9+.-]*:(?=\S)/i, // a scheme: http://, tel:, mailto:, javascript:
  /www\.|@/i, // "www." or an email address
  /[\p{L}\p{N}_-]+[.\u3002\uff61][\p{L}]{2,}/u, // name.tld in any script, incl. "。"
  /(?:\d[\s().+-]*){7,}/, // a phone number (7 or more digits), which phones make tappable
];

function looksLikeLink(text: string): boolean {
  const normalized = text.normalize('NFKC');
  return LINK_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * The public form doesn't verify the email address, so a spammer could put someone
 * else's address on a request and a link in the name or item. Declines go out from
 * the business's domain, so customer text that looks like a link (or runs long) is
 * replaced with a plain word instead of being repeated.
 */
function safeCustomerText(value: string, maxLength: number, fallback: string): string {
  const text = oneLine(value);
  if (!text || text.length > maxLength || looksLikeLink(text)) return fallback;
  return text;
}

export function customerAddress(inquiry: Pick<DeclinedInquiry, 'email'>): string | undefined {
  const email = inquiry.email?.trim();
  return email && email.length <= 254 && MAILBOX.test(email) ? email : undefined;
}

/**
 * Wording is a draft until Girlie and Todd approve it. SSPMW-173 will move this
 * into the shared branded template.
 */
export function buildDeclineEmail(inquiry: DeclinedInquiry): { subject: string; text: string } {
  const firstName = safeCustomerText(inquiry.first_name, 40, 'there');
  const item = safeCustomerText(inquiry.item, 60, 'item');
  const inquiryNumber = oneLine(inquiry.inquiry_number);
  return {
    subject: `Your estimate request ${inquiryNumber}`,
    text: [
      `Hi ${firstName},`,
      '',
      `Thank you for asking ${businessContact.name} about your ${item}.`,
      `We're sorry, but we aren't able to take on this request (${inquiryNumber}).`,
      '',
      `If you have any questions, please call us at ${businessContact.phoneDisplay}.`,
      '',
      'Thank you,',
      businessContact.name,
    ].join('\n'),
  };
}

export function createDeclineEmailSender(
  email: DeclineEmailConfig,
  fetchEmail: typeof fetch = fetch,
): DeclineEmailSender {
  return {
    async send(inquiry) {
      const to = customerAddress(inquiry);
      if (!to) throw new Error('The inquiry has no usable email address.');
      const { subject, text } = buildDeclineEmail(inquiry);
      const response = await fetchEmail('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${email.apiKey}`,
          'Content-Type': 'application/json',
          // Within 24 hours, a retried decline never sends the customer a second email.
          'Idempotency-Key': `inquiry-declined/${inquiry.id}`,
        },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          from: email.from,
          to: [to],
          subject,
          text,
          ...(email.replyTo?.length ? { reply_to: email.replyTo } : {}),
        }),
      });
      if (response.status === 409) {
        const error: unknown = await response.json().catch(() => undefined);
        const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined;
        if (typeof name === 'string' && ALREADY_SENT_ERRORS.has(name)) return 'already_sent';
      }
      if (!response.ok) throw new Error('Decline email could not be sent.');
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== 'object' ||
        !('id' in result) ||
        typeof result.id !== 'string' ||
        !result.id.trim()
      ) {
        throw new Error('Decline email was not acknowledged.');
      }
      return 'sent';
    },
  };
}

/**
 * The sender for the server's Resend settings (the same ones contact messages use),
 * or undefined when email is not configured. Replies go to the owner addresses.
 */
export function createDeclineEmailFromConfig(
  config: Pick<Config, 'contactEmail'>,
  fetchEmail: typeof fetch = fetch,
): DeclineEmailSender | undefined {
  const email = config.contactEmail;
  return email
    ? createDeclineEmailSender(
        { apiKey: email.apiKey, from: email.from, replyTo: email.to },
        fetchEmail,
      )
    : undefined;
}

export type DeclineEmailResult = 'sent' | 'already_sent' | 'no_email' | 'unavailable' | 'failed';

/**
 * Call after the decline is saved (SSPMW-172 sets the inquiry's status to `closed`).
 * It never throws, so a failed email can't undo or fail the decline. The result
 * lets the screen tell the owner when the customer was not emailed.
 */
export async function notifyCustomerOfDecline(
  sender: DeclineEmailSender | undefined,
  inquiry: DeclinedInquiry,
): Promise<DeclineEmailResult> {
  if (!customerAddress(inquiry)) return 'no_email';
  if (!sender) return 'unavailable';
  try {
    return await sender.send(inquiry);
  } catch {
    // Inquiry id only: no customer details or provider errors in the logs.
    console.error('Decline email failed', { inquiryId: inquiry.id });
    return 'failed';
  }
}

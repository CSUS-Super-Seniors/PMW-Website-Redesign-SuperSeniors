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
  send(inquiry: DeclinedInquiry): Promise<void>;
}

const MAILBOX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Customer text goes in a plain-text email on one line, so it can't add headers or markup. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
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
  const firstName = oneLine(inquiry.first_name) || 'there';
  const item = oneLine(inquiry.item) || 'item';
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
          // A retried decline never sends the customer a second email.
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

export type DeclineEmailResult = 'sent' | 'no_email' | 'unavailable' | 'failed';

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
    await sender.send(inquiry);
    return 'sent';
  } catch {
    // Inquiry id only: no customer details or provider errors in the logs.
    console.error('Decline email failed', { inquiryId: inquiry.id });
    return 'failed';
  }
}

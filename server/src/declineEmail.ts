import { createHash } from 'node:crypto';
import { businessContact } from '@pmw/validation';
import type { Config } from './config.js';
import { safeCustomerText } from './lib/customerEmailText.js';
import { isBareMailbox, sendResendEmail, type ResendCredentials } from './lib/resendEmail.js';

/** The inquiry fields the decline email may use. Internal notes are never passed in. */
export interface DeclinedInquiry {
  id: string;
  inquiry_number: string;
  first_name: string;
  item: string;
  /** The address on that inquiry, as the customer typed it. */
  email: string | null;
}

export interface DeclineEmailConfig extends ResendCredentials {
  /** Owner addresses, so a customer's reply reaches Girlie and Todd. */
  replyTo?: string[];
}

export interface DeclineEmailSender {
  /**
   * `already_sent` means Resend had already sent this decline's email to the same
   * address. Rejects when the email was not sent, including when another send for
   * this decline is still running.
   */
  send(inquiry: DeclinedInquiry): Promise<'sent' | 'already_sent'>;
}

/** Customer text goes in a plain-text email on one line, so it can't add headers or markup. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function customerAddress(inquiry: Pick<DeclinedInquiry, 'email'>): string | undefined {
  const email = inquiry.email?.trim();
  return email && isBareMailbox(email) ? email : undefined;
}

/**
 * Wording is a draft until Girlie and Todd approve it. SSPMW-173 will move this
 * into the shared branded template.
 */
export function buildDeclineEmail(inquiry: DeclinedInquiry): { subject: string; text: string } {
  const firstName = safeCustomerText(inquiry.first_name, 40, 'there');
  // The sentence adds its own period, so "Sofa." doesn't print as "Sofa..".
  const item = safeCustomerText(inquiry.item, 60, 'item').replace(/\.+$/, '') || 'item';
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

/**
 * One key per inquiry and address: a retried decline never emails the customer twice,
 * but a decline sent again after the address was corrected reaches the new address.
 */
export function declineIdempotencyKey(inquiryId: string, to: string): string {
  const address = createHash('sha256').update(to.toLowerCase()).digest('hex').slice(0, 16);
  return `inquiry-declined/${inquiryId}/${address}`;
}

export function createDeclineEmailSender(
  email: DeclineEmailConfig,
  fetchEmail: typeof fetch = fetch,
): DeclineEmailSender {
  return {
    async send(inquiry) {
      const to = customerAddress(inquiry);
      if (!to) throw new Error('The inquiry has no usable email address.');
      return sendResendEmail(
        email,
        {
          to: [to],
          ...buildDeclineEmail(inquiry),
          replyTo: email.replyTo,
          idempotencyKey: declineIdempotencyKey(inquiry.id, to),
        },
        'Decline email',
        fetchEmail,
      );
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
 * For the decline action (SSPMW-172) to call after it saves the decline (status
 * `closed`). It never throws, so a failed email can't undo or fail the decline. The
 * result lets the screen tell the owner when the customer was not emailed.
 * `no_email` covers an inquiry with no address or one that isn't a usable address.
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

import { createHash } from 'node:crypto';
import { domainToASCII } from 'node:url';
import { parse as parseHostname } from 'tldts';
import { businessContact } from '@pmw/validation';
import type { Config } from './config.js';
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

// Invisible characters: zero-width spaces, soft hyphens, variation selectors, the
// combining grapheme joiner and other format or default-ignorable characters.
const INVISIBLE = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu;

/** What the customer sees: full-width letters folded (NFKC) and invisible characters dropped. */
function cleanText(value: string): string {
  return oneLine(value.normalize('NFKC').replace(INVISIBLE, ''));
}

// Things a mail app could turn into a link, checked against a copy of the text with
// combining marks removed, every kind of dash (and "~") turned into "-", and digits
// from any script turned into "0", so a combining mark after the dot, en dashes
// between digits and Arabic digits count too.
const LINK_PATTERNS = [
  /[a-z][a-z0-9+.-]*:\/\//i, // any scheme with "//", like http:// or ftp://
  /\b(?:tel|sms|smsto|mailto|callto|facetime|skype|whatsapp|javascript|vbscript|data|file):(?=\S)/i,
  /www\.|@/i, // "www." or an email address
  /(?:\d[\s().+\-/_\u00b7\u2022|*[\]]*){7,}/, // a phone number (7+ digits), which phones make tappable
];

/** Dot-separated words in any script, including the ideographic dots "。" and "｡". */
const HOSTNAME_LIKE = /[\p{L}\p{N}_-]+(?:[.\u3002\uff61][\p{L}\p{N}_-]+)+/gu;

/**
 * True when the text names a domain on a real top-level domain (spam.com, bit.ly,
 * пример.рф). "Mr.Smith" or "shelf.unit" end in something that isn't a TLD, so no
 * site can live there and mail apps don't link them. Every place the name could end
 * is checked, so "spam.com.2" or "spam.com.unit" still count.
 */
function containsDomain(text: string): boolean {
  for (const [match] of text.matchAll(HOSTNAME_LIKE)) {
    const labels = match.toLowerCase().split(/[.\u3002\uff61]/);
    for (let end = 2; end <= labels.length; end += 1) {
      // Ends in a number ("v1.2", "3.5"): not a domain. IP addresses count as phone numbers.
      if (/^\d+$/.test(labels[end - 1] ?? '')) continue;
      const ascii = domainToASCII(labels.slice(0, end).join('.'));
      // A name that can't be converted isn't trusted: treat it as a link.
      if (!ascii || parseHostname(ascii).isIcann) return true;
    }
  }
  return false;
}

function looksLikeLink(cleaned: string): boolean {
  const forCheck = cleaned
    .replace(/\p{M}/gu, '')
    .replace(/[\p{Pd}\u2212\u223c~]/gu, '-')
    .replace(/\p{Nd}/gu, '0');
  return LINK_PATTERNS.some((pattern) => pattern.test(forCheck)) || containsDomain(forCheck);
}

/**
 * The public form doesn't verify the email address, so a spammer could put someone
 * else's address on a request and a link in the name or item. Declines go out from
 * the business's domain, so customer text that looks like a link (or runs long) is
 * replaced with a plain word instead of being repeated. The text that is sent is the
 * same cleaned text that was checked.
 */
function safeCustomerText(value: string, maxLength: number, fallback: string): string {
  const text = cleanText(value);
  if (!text || text.length > maxLength || looksLikeLink(text)) return fallback;
  return text;
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

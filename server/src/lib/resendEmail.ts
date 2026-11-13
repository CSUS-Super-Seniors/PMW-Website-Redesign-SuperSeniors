import { EmailDeliveryError } from './emailDeliveryError.js';

/**
 * One @, no spaces or angle brackets, and a domain with at least one dot. Dots
 * separate non-empty parts on both sides, so "a@b..co", ".a@b.co" and "a@b.co."
 * are refused.
 */
const MAILBOX = /^[^\s@<>.]+(?:\.[^\s@<>.]+)*@[^\s@<>.]+(?:\.[^\s@<>.]+)+$/;

/** A bare email address (no display name), at most 254 characters. */
export function isBareMailbox(value: string): boolean {
  return value.length <= 254 && MAILBOX.test(value);
}

export interface ResendCredentials {
  apiKey: string;
  /** Bare address on the domain verified in Resend. */
  from: string;
}

export interface ResendMessage {
  to: string[];
  subject: string;
  /** Plain-text body, also used as the fallback when HTML is supplied. */
  text: string;
  /** Optional template HTML; the caller must escape all customer text. */
  html?: string;
  replyTo?: string | string[];
  /** Within 24 hours, a request with the same key never sends a second email. */
  idempotencyKey: string;
}

/**
 * Sends one email through Resend. `already_sent` means this idempotency key was
 * already used for a request with different details (Resend's 409
 * `invalid_idempotent_request`). A 409 for a request that is still running
 * (`concurrent_idempotent_requests`) is an error: that request can still fail.
 * `label` names the email in error messages, which never include provider details.
 */
export async function sendResendEmail(
  credentials: ResendCredentials,
  message: ResendMessage,
  label: string,
  fetchEmail: typeof fetch = fetch,
): Promise<'sent' | 'already_sent'> {
  const response = await fetchEmail('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': message.idempotencyKey,
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      from: credentials.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo?.length ? { reply_to: message.replyTo } : {}),
    }),
  });
  if (response.status === 409) {
    const error: unknown = await response.json().catch(() => undefined);
    const name = error && typeof error === 'object' && 'name' in error ? error.name : undefined;
    if (name === 'invalid_idempotent_request') return 'already_sent';
  }
  if (!response.ok)
    throw new EmailDeliveryError('http_error', response.status, `${label} could not be sent.`);
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== 'object' ||
    !('id' in result) ||
    typeof result.id !== 'string' ||
    !result.id.trim()
  ) {
    throw new EmailDeliveryError(
      'invalid_response',
      response.status,
      `${label} was not acknowledged.`,
    );
  }
  return 'sent';
}

import type { ContactMessageData } from '@pmw/validation';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContactEmailConfig } from './config.js';

export interface SavedContactMessage extends ContactMessageData {
  id: string;
  created_at: string;
}

export interface ContactBackend {
  saveMessage(message: ContactMessageData): Promise<SavedContactMessage>;
  sendNotification(message: SavedContactMessage): Promise<void>;
}

// A fixed From address avoids spoofing visitors' email domains. Visitor text is
// sent as plain text, so markup in a message never becomes email HTML.
export function createContactBackend(
  client: Pick<SupabaseClient, 'from'>,
  email: ContactEmailConfig,
  fetchEmail: typeof fetch = fetch,
): ContactBackend {
  return {
    async saveMessage(message) {
      const { data, error } = await client
        .from('contact_messages')
        .insert(message)
        .select('id,created_at')
        .single();
      if (error || !data?.id || !data.created_at) {
        throw new Error('Contact message could not be saved.');
      }
      return { ...message, id: data.id, created_at: data.created_at };
    },
    async sendNotification(message) {
      const response = await fetchEmail('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${email.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `contact-message/${message.id}`,
        },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          from: email.from,
          to: email.to,
          subject: 'New contact message',
          ...(message.email ? { reply_to: message.email } : {}),
          text: [
            'New contact message',
            '',
            `Name: ${message.name}`,
            `Phone: ${message.phone ?? 'Not provided'}`,
            `Email: ${message.email ?? 'Not provided'}`,
            `Received: ${message.created_at}`,
            `Message ID: ${message.id}`,
            '',
            message.message,
          ].join('\n'),
        }),
      });
      if (!response.ok) throw new Error('Contact notification could not be sent.');
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== 'object' ||
        !('id' in result) ||
        typeof result.id !== 'string' ||
        !result.id.trim()
      ) {
        throw new Error('Contact notification was not acknowledged.');
      }
    },
  };
}

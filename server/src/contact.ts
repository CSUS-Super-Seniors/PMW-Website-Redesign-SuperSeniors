import type { ContactMessageData } from '@pmw/validation';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContactEmailConfig } from './config.js';
import { sendResendEmail } from './lib/resendEmail.js';

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
      await sendResendEmail(
        email,
        {
          to: email.to,
          subject: 'New contact message',
          replyTo: message.email ?? undefined,
          idempotencyKey: `contact-message/${message.id}`,
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
        },
        'Contact notification',
        fetchEmail,
      );
    },
  };
}

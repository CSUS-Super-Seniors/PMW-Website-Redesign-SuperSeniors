import type { ContactMessageFieldErrors } from '@pmw/validation';

export interface ContactMessage {
  name: string;
  phone: string | null;
  email: string | null;
  message: string;
}

export class ContactValidationError extends Error {
  readonly fieldErrors: ContactMessageFieldErrors;

  constructor(fieldErrors: ContactMessageFieldErrors) {
    super('Please check the contact form.');
    this.name = 'ContactValidationError';
    this.fieldErrors = fieldErrors;
  }
}

export async function sendContactMessage(message: ContactMessage): Promise<void> {
  const stub = import.meta.env.DEV ? import.meta.env.VITE_CONTACT_FORM_STUB : undefined;
  if (stub === 'success' || stub === 'failure') {
    await new Promise<void>((resolve) => setTimeout(resolve, 600));
    if (stub === 'failure') throw new Error('Contact form preview failure');
    return;
  }

  const response = await fetch('/api/contact-messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!response.ok) {
    if (response.status === 400) {
      const body: unknown = await response.json().catch(() => null);
      if (body && typeof body === 'object' && 'fieldErrors' in body) {
        const fields = body.fieldErrors;
        if (fields && typeof fields === 'object') {
          const fieldErrors: ContactMessageFieldErrors = {};
          for (const field of ['name', 'phone', 'email', 'message'] as const) {
            const value: unknown = Reflect.get(fields, field);
            if (typeof value === 'string' && value.trim()) fieldErrors[field] = value;
          }
          if (Object.keys(fieldErrors).length) throw new ContactValidationError(fieldErrors);
        }
      }
    }
    throw new Error('Contact message was not accepted');
  }
}

export interface ContactMessage {
  name: string;
  phone: string | null;
  email: string | null;
  message: string;
}

/** C5 integration point. Confirm the URL and payload with SSPMW-268 before merging. */
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
  if (!response.ok) throw new Error('Contact message was not accepted');
}

import { describe, expect, it } from 'vitest';
import { contactMessageSchema, mapContactMessageErrors } from '../src/contactMessage.js';

describe('shared contact message contract', () => {
  it('normalizes optional contact fields and trims required text', () => {
    expect(
      contactMessageSchema.parse({
        name: ' 李 ',
        email: ' me@example.com ',
        phone: ' ',
        message: ' Hello\nworld ',
      }),
    ).toEqual({ name: '李', email: 'me@example.com', phone: null, message: 'Hello\nworld' });
  });

  it('accepts the documented length boundaries', () => {
    expect(
      contactMessageSchema.safeParse({
        name: 'n'.repeat(100),
        phone: '9165550123',
        message: 'm'.repeat(500),
      }).success,
    ).toBe(true);
  });

  it.each([501, 5000])('rejects a %i-character message', (length) => {
    const result = contactMessageSchema.safeParse({
      name: 'Todd',
      phone: '9165550123',
      message: 'm'.repeat(length),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(mapContactMessageErrors(result.error).fieldErrors.message).toBe(
        'Message must be 500 characters or fewer.',
      );
    }
  });

  it.each(['9166435686', '(916) 643-5686', '+1 916-643-5686', '1.916.643.5686'])(
    'normalizes %s to the same US international number',
    (phone) => {
      expect(
        contactMessageSchema.parse({ name: 'Todd', phone, message: 'Please call me.' }).phone,
      ).toBe('+19166435686');
    },
  );

  it.each(['a@b.c', 'not-an-email', 'person@example'])('rejects invalid email %s', (email) => {
    expect(contactMessageSchema.shape.email.safeParse(email).success).toBe(false);
  });

  it.each(['12345', '0166435686', '9161435686', '+44 20 7946 0958'])(
    'rejects invalid US phone %s',
    (phone) => {
      expect(contactMessageSchema.shape.phone.safeParse(phone).success).toBe(false);
    },
  );

  it('maps the missing contact method to a field error', () => {
    const result = contactMessageSchema.safeParse({
      name: 'Todd',
      message: 'Hi',
      phone: '',
      email: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(mapContactMessageErrors(result.error)).toEqual({
        fieldErrors: { email: 'Provide a phone number or email address.' },
        formErrors: [],
      });
    }
  });

  it('rejects server-owned fields with a form error', () => {
    const result = contactMessageSchema.safeParse({
      name: 'Todd',
      phone: '9165550123',
      message: 'Hi',
      created_at: '2026-01-01',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(mapContactMessageErrors(result.error).formErrors).toHaveLength(1);
  });
});

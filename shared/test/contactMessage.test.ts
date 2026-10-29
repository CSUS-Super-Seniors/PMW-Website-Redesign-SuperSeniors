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
        message: 'm'.repeat(5000),
      }).success,
    ).toBe(true);
  });

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

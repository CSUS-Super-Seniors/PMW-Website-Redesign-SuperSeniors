import { describe, expect, it } from 'vitest';
import { mapStaffInviteErrors, staffInviteSchema } from '../src/staffInvite.js';

function errorsFor(input: unknown) {
  const result = staffInviteSchema.safeParse(input);
  if (result.success) throw new Error('Expected the invite to be refused');
  return mapStaffInviteErrors(result.error);
}

describe('shared staff invite contract', () => {
  it('trims the name and trims and lowercases the email', () => {
    expect(
      staffInviteSchema.parse({
        fullName: '  Sam Rivera ',
        email: ' Sam@Example.COM ',
        role: 'employee',
      }),
    ).toEqual({ fullName: 'Sam Rivera', email: 'sam@example.com', role: 'employee' });
  });

  it('accepts both roles', () => {
    for (const role of ['owner', 'employee']) {
      expect(staffInviteSchema.safeParse({ fullName: 'A', email: 'a@b.co', role }).success).toBe(
        true,
      );
    }
  });

  it('names every missing field', () => {
    expect(errorsFor({ fullName: ' ', email: '', role: '' })).toEqual({
      fieldErrors: {
        fullName: 'Enter a name.',
        email: 'Enter an email address.',
        role: 'Choose a role.',
      },
      formErrors: [],
    });
    expect(errorsFor({}).fieldErrors).toEqual({
      fullName: 'Enter a name.',
      email: 'Enter an email address.',
      role: 'Choose a role.',
    });
  });

  it.each(['todd', 'todd@', '@example.com', 'todd@example', 'todd example@x.com'])(
    'refuses the invalid email %s',
    (email) => {
      expect(errorsFor({ fullName: 'Todd', email, role: 'owner' }).fieldErrors).toEqual({
        email: 'Enter a valid email address, like name@example.com.',
      });
    },
  );

  it('refuses a role that does not exist', () => {
    expect(errorsFor({ fullName: 'Todd', email: 't@x.co', role: 'admin' }).fieldErrors).toEqual({
      role: 'Choose a role.',
    });
  });

  it('refuses long values', () => {
    expect(
      errorsFor({ fullName: 'n'.repeat(101), email: `${'e'.repeat(250)}@x.co`, role: 'owner' })
        .fieldErrors,
    ).toEqual({
      fullName: 'Name must be 100 characters or fewer.',
      email: 'Email must be 254 characters or fewer.',
    });
  });

  it('refuses extra fields and non-objects as form errors', () => {
    expect(
      errorsFor({ fullName: 'A', email: 'a@b.co', role: 'owner', status: 'active' }).formErrors,
    ).toEqual(['Some form fields are not recognized. Please refresh the page and try again.']);
    expect(errorsFor('hello').formErrors).toEqual(['Please send the invite as a JSON object.']);
  });
});

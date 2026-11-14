import { afterEach, describe, expect, it, vi } from 'vitest';
import { issueOptions } from '@pmw/validation';
import { loadConfig } from '../src/config.js';
import {
  buildOwnerNoticeEmail,
  ownerInquiryUrl,
  warnIfOwnerNoticeUnavailable,
} from '../src/ownerNoticeEmail.js';

afterEach(() => vi.restoreAllMocks());

const saved = {
  id: '60000000-0000-4000-8000-000000000002',
  inquiry_number: 'INQ-1048',
};
const details = {
  first_name: '  Zoë 李 ',
  last_name: ' O’Connor ',
  item: 'Dining chair',
  city: 'Carmichael',
  issue_type: 'loose_joints' as const,
};

describe('owner estimate notice', () => {
  it('includes the saved inquiry, customer, item, city, readable issue and exact detail link', () => {
    const message = buildOwnerNoticeEmail(saved, details, 'https://staging.example');
    expect(message.subject).toBe('New estimate request: INQ-1048');
    for (const text of [
      'Inquiry: INQ-1048',
      'Customer: Zoë 李 O’Connor',
      'Item: Dining chair',
      'City: Carmichael',
      'What happened: Loose joints / wobbling',
      `https://staging.example/portal/inquiries/${saved.id}`,
      'Owner login is required.',
    ])
      expect(message.text).toContain(text);
    expect(message.text).not.toContain('/inquiries/INQ-1048');
    expect(message.text).not.toContain('loose_joints');
  });

  it('keeps full contact details, descriptions, internal notes and photo credentials behind login', () => {
    const fullDetails = {
      ...details,
      email: 'private@example.com',
      phone: '(916) 555-0142',
      address: '123 Private Street',
      description: 'PRIVATE DESCRIPTION',
      notes: 'PRIVATE INTERNAL NOTES',
      photoSession: { token: 'PRIVATE TOKEN' },
      photos: [{ storagePath: 'private/photo.jpg', receipt: 'PRIVATE RECEIPT' }],
    };
    const message = buildOwnerNoticeEmail(saved, fullDetails, 'https://portal.example');
    for (const text of ['private@', '555-0142', 'Private Street', 'PRIVATE', 'private/photo'])
      expect(message.text).not.toContain(text);
  });

  it('keeps visitor text on single lines and sends markup as plain text', () => {
    const { text } = buildOwnerNoticeEmail(
      saved,
      {
        ...details,
        first_name: 'Ana\r\nBcc: Todd',
        item: 'Oak\n\n <script>table</script>',
        city: ' Carmichael\n CA ',
      },
      'https://portal.example',
    );
    expect(text).toContain('Customer: Ana Bcc: Todd O’Connor');
    expect(text).toContain('Item: Oak <script>table</script>');
    expect(text).toContain('City: Carmichael CA');
    expect(text.split('\n')).not.toContain('Bcc: Todd');
  });

  it.each(issueOptions)('uses the shared label for issue $value', ({ value, label }) => {
    const { text } = buildOwnerNoticeEmail(
      saved,
      {
        ...details,
        issue_type: value,
      },
      'https://portal.example',
    );
    expect(text).toContain(`What happened: ${label}`);
  });
});

describe('owner inquiry URL configuration', () => {
  it.each([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://[::1]:5173',
    'https://preview.example',
    'https://portal.example:8443',
  ])('uses the explicitly configured origin %s', (origin) => {
    expect(ownerInquiryUrl(origin, saved.id)).toBe(`${origin}/portal/inquiries/${saved.id}`);
  });

  it.each([
    undefined,
    '',
    'not-a-url',
    'http://portal.example',
    'http://localhost.attacker.example',
    'http://192.168.1.2:5173',
    '//portal.example',
    'javascript:alert(1)',
    'https://portal.example/',
    'https://portal.example/path',
    'https://portal.example?token=x',
    'https://portal.example#fragment',
    'https://user:password@portal.example',
  ])('rejects an absent or non-origin destination: %s', (origin) => {
    expect(() => ownerInquiryUrl(origin, saved.id)).toThrow('OWNER_PORTAL_ORIGIN');
  });

  it('encodes the inquiry identifier as one path segment without adding credentials or query data', () => {
    const url = new URL(ownerInquiryUrl('https://portal.example', 'x/y?token=x#fragment'));
    expect(url.origin).toBe('https://portal.example');
    expect(url.pathname).toBe('/portal/inquiries/x%2Fy%3Ftoken%3Dx%23fragment');
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
  });

  it('loads the optional server setting without making it a startup requirement', () => {
    const env = {
      CLIENT_ORIGINS: 'http://localhost:5173',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-secret',
    };
    expect(loadConfig(env).ownerPortalOrigin).toBeUndefined();
    expect(
      loadConfig({ ...env, OWNER_PORTAL_ORIGIN: ' https://portal.example ' }).ownerPortalOrigin,
    ).toBe('https://portal.example');
  });
});

describe('owner notice startup warning', () => {
  it.each([undefined, 'https://user:PRIVATE_PASSWORD@portal.example'])(
    'warns for an unusable origin without leaking its value: %s',
    (origin) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      warnIfOwnerNoticeUnavailable(origin);
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        'Owner estimate notices are unavailable: OWNER_PORTAL_ORIGIN must be an exact HTTPS origin; HTTP is allowed only for localhost, 127.0.0.1 or [::1].',
      );
      expect(JSON.stringify(warn.mock.calls)).not.toContain('PRIVATE_PASSWORD');
    },
  );

  it('does not warn for a valid portal origin', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnIfOwnerNoticeUnavailable('https://portal.example');
    expect(warn).not.toHaveBeenCalled();
  });
});

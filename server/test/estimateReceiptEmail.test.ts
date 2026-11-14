import { describe, expect, it } from 'vitest';
import { businessContact } from '@pmw/validation';
import { buildEstimateReceiptEmail } from '../src/estimateReceiptEmail.js';

const saved = { inquiry_number: 'INQ-1048' };
const details = { first_name: '  Zoë 李  ', item: 'Dining chair' };

describe('customer estimate receipt', () => {
  it('confirms the request with the correct first name, INQ number, item and business phone', () => {
    const message = buildEstimateReceiptEmail(saved, details);
    expect(message.subject).toBe('Estimate request received');
    for (const body of [message.text, message.html]) {
      expect(body).toContain('Hi Zoë 李,');
      expect(body).toContain('INQ-1048');
      expect(body).toContain('Dining chair');
      expect(body).toContain(businessContact.name);
      expect(body).toContain(businessContact.phoneDisplay);
      expect(body).toContain('We received your estimate request.');
      expect(body).toContain('We will review your request and contact you about the next steps.');
      expect(body).toContain('Carmichael, CA');
    }
    expect(message.html).toContain(`href="${businessContact.phoneHref}"`);
  });

  it('limits the receipt to confirmation details even when passed the full form', () => {
    const fullDetails = {
      ...details,
      last_name: 'PRIVATE SURNAME',
      email: 'private@example.com',
      phone: '(916) 555-0142',
      address: '123 Private Street',
      description: 'PRIVATE DESCRIPTION',
      photoSession: { token: 'PRIVATE TOKEN' },
      photos: [{ storagePath: 'private/photo.jpg' }],
      notes: 'PRIVATE INTERNAL NOTES',
    };
    const message = buildEstimateReceiptEmail(saved, fullDetails);
    for (const body of [message.text, message.html]) {
      for (const secret of ['PRIVATE', 'private@', '555-0142', 'Private Street', 'private/photo'])
        expect(body).not.toContain(secret);
    }
  });

  it('escapes customer markup in HTML and keeps it as text in the fallback', () => {
    const message = buildEstimateReceiptEmail(saved, {
      first_name: 'Ana & <b>Jo</b>',
      item: 'Chair <img src=x onerror="alert(1)"> & \'Oak\'',
    });
    expect(message.html).toContain('Ana &amp; &lt;b&gt;Jo&lt;/b&gt;');
    expect(message.html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(message.html).toContain('&#39;Oak&#39;');
    expect(message.html).not.toMatch(/<img|<b>Jo/);
    expect(message.text).toContain('Ana & <b>Jo</b>');
  });

  it.each([
    'https://spam.example/win',
    'spam.com',
    'spam.\u200bcom',
    'ｓｐａｍ．ｃｏｍ',
    'win@spam.example',
    'call 888\u2013555\u20130199',
  ])('does not relay link-like public form text through the business sender: %s', (value) => {
    const message = buildEstimateReceiptEmail(saved, { first_name: value, item: value });
    for (const body of [message.text, message.html]) {
      expect(body).toContain('Hi there,');
      expect(body).toContain('Furniture repair request');
      expect(body).not.toContain('spam');
      expect(body).not.toContain('888');
      expect(body).toContain('INQ-1048');
    }
  });

  it('keeps ordinary names and items up to the form limits without inventing email lines', () => {
    const message = buildEstimateReceiptEmail(saved, {
      first_name: 'A'.repeat(100),
      item: 'B'.repeat(200),
    });
    expect(message.text).toContain(`Hi ${'A'.repeat(100)},`);
    expect(message.html).toContain('B'.repeat(200));
    const multiline = buildEstimateReceiptEmail(saved, {
      first_name: 'Ana\r\nBcc: Todd',
      item: 'Oak\n\n  table',
    });
    expect(multiline.text.split('\n')[0]).toBe('Hi Ana Bcc: Todd,');
    expect(multiline.text).toContain('Item: Oak table');
  });
});

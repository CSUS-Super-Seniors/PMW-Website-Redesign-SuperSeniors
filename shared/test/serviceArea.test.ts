import { describe, expect, it } from 'vitest';
import {
  isCityInServiceArea,
  normalizeCityName,
  serviceAreaCheckSchema,
} from '../src/serviceArea.js';

const cities = ['Carmichael', 'Fair Oaks', 'Citrus Heights'];

describe('normalizeCityName', () => {
  it.each([
    ['Carmichael', 'carmichael'],
    ['  CARMICHAEL  ', 'carmichael'],
    ['Fair   Oaks', 'fair oaks'],
    ['Fair\tOaks', 'fair oaks'],
    ['Carmichael, CA', 'carmichael'],
    ['Carmichael CA', 'carmichael'],
    ['Carmichael, California', 'carmichael'],
    ['carmichael, ca.', 'carmichael'],
    ['Carmichael,', 'carmichael'],
    ['Sacramento, CA 95821', 'sacramento'],
    ['Sacramento CA 95821-1234', 'sacramento'],
    ['Sacramento 95821', 'sacramento'],
    ['Sacramento, California, 95821', 'sacramento'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeCityName(input)).toBe(expected);
  });

  it('keeps a city whose name only starts with "Ca"', () => {
    expect(normalizeCityName('Calistoga')).toBe('calistoga');
  });
});

describe('isCityInServiceArea', () => {
  it('passes Carmichael and blocks Davis', () => {
    expect(isCityInServiceArea('Carmichael', cities)).toBe(true);
    expect(isCityInServiceArea('Davis', cities)).toBe(false);
  });

  it('ignores capitalization, extra spaces and a trailing state', () => {
    expect(isCityInServiceArea('  fair  OAKS, CA ', cities)).toBe(true);
  });

  it('normalizes the stored city names too', () => {
    expect(isCityInServiceArea('Fair Oaks', ['  FAIR OAKS '])).toBe(true);
  });

  it.each(['', '   ', ', CA'])('never approves a blank city %j', (city) => {
    expect(isCityInServiceArea(city, ['', ...cities])).toBe(false);
  });

  it('blocks every city when no cities are configured', () => {
    expect(isCityInServiceArea('Carmichael', [])).toBe(false);
  });

  it('does not treat a partial name as a match', () => {
    expect(isCityInServiceArea('Carmichael Park', cities)).toBe(false);
    expect(isCityInServiceArea('Oaks', cities)).toBe(false);
  });
});

describe('serviceAreaCheckSchema', () => {
  it('accepts a city', () => {
    expect(serviceAreaCheckSchema.parse({ city: 'Davis' })).toEqual({ city: 'Davis' });
  });

  it.each([{}, { city: '' }, { city: '  ' }, { city: 5 }, { city: 'a'.repeat(101) }])(
    'rejects %j',
    (body) => {
      expect(serviceAreaCheckSchema.safeParse(body).success).toBe(false);
    },
  );

  it('rejects unknown fields', () => {
    expect(serviceAreaCheckSchema.safeParse({ city: 'Davis', address: '1 Main' }).success).toBe(
      false,
    );
  });
});

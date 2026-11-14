import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  escapeLike,
  normalizeEmail,
  normalizePhone,
  phoneLookupTail,
  phonesMatch,
} from '../src/customerMatch.js';

test('normalizeEmail trims, lowercases, and treats blank as missing', () => {
  assert.equal(normalizeEmail('  Margaret@Example.COM '), 'margaret@example.com');
  assert.equal(normalizeEmail('   '), null);
  assert.equal(normalizeEmail(null), null);
  assert.equal(normalizeEmail(undefined), null);
});

test('normalizePhone reduces every accepted format to ten digits', () => {
  for (const typed of [
    '(916) 555-0142',
    '916-555-0142',
    '916.555.0142',
    '9165550142',
    '+1 916-555-0142',
    '1 (916) 555 0142',
  ]) {
    assert.equal(normalizePhone(typed), '9165550142', typed);
  }
});

test('normalizePhone rejects values that are not a full number', () => {
  assert.equal(normalizePhone('555-0142'), null);
  assert.equal(normalizePhone('12345678901234'), null);
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone(null), null);
});

test('phonesMatch compares digits, and never matches two missing numbers', () => {
  assert.equal(phonesMatch('(916) 555-0142', '+1 916-555-0142'), true);
  assert.equal(phonesMatch('(916) 555-0142', '(916) 555-0143'), false);
  assert.equal(phonesMatch(null, null), false);
  assert.equal(phonesMatch('555-0142', '555-0142'), false);
});

test('phoneLookupTail returns the last four digits', () => {
  assert.equal(phoneLookupTail('(916) 555-0142'), '0142');
  assert.equal(phoneLookupTail('not a phone'), null);
});

test('escapeLike escapes ilike wildcards', () => {
  assert.equal(escapeLike('a_b%c\\d@x.com'), 'a\\_b\\%c\\\\d@x.com');
  assert.equal(escapeLike('plain@x.com'), 'plain@x.com');
});

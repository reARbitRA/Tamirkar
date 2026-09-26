import test from 'node:test';
import assert from 'node:assert/strict';
import { latinDigits, normalizeIranMobile } from '../src/phone.js';

test('normalizes common Iranian mobile forms to E.164', () => {
  assert.equal(normalizeIranMobile('09121234567'), '+989121234567');
  assert.equal(normalizeIranMobile('+989121234567'), '+989121234567');
  assert.equal(normalizeIranMobile('00989121234567'), '+989121234567');
  assert.equal(normalizeIranMobile('989121234567'), '+989121234567');
  assert.equal(normalizeIranMobile('۰۹۱۲۱۲۳۴۵۶۷'), '+989121234567');
});

test('rejects non-mobile and malformed numbers', () => {
  assert.equal(normalizeIranMobile('02112345678'), null);
  assert.equal(normalizeIranMobile('0912123456'), null);
  assert.equal(normalizeIranMobile('not-a-phone'), null);
});

test('converts Persian and Arabic-Indic numerals', () => {
  assert.equal(latinDigits('۱۲۳٤٥٦'), '123456');
});

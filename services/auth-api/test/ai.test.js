import assert from 'node:assert/strict';
import test from 'node:test';
import { redactPromptText } from '../src/ai.js';

test('redacts phone numbers and ten-digit national IDs before AI prompting', () => {
  const redacted = redactPromptText('شماره من ۰۹۱۲۱۲۳۴۵۶۷ نیست ولی +989121234567 و کد ۱۲۳۴۵۶۷۸۹۰ است');
  assert.match(redacted, /شماره حذف شد/);
  assert.match(redacted, /شناسه حذف شد/);
  assert.doesNotMatch(redacted, /989121234567/);
});

test('caps prompt text length', () => {
  assert.equal(redactPromptText('الف'.repeat(3000)).length, 2000);
});

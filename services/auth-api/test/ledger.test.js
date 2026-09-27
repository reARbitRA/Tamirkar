import assert from 'node:assert/strict';
import test from 'node:test';
import { postLedgerEntry } from '../src/ledger.js';

function fakeClient({ duplicate = false } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT id FROM ledger_entries')) {
        return { rows: duplicate ? [{ id: 'existing-entry' }] : [] };
      }
      return { rows: [] };
    }
  };
}

test('posts a balanced, idempotent double-entry ledger event', async () => {
  const client = fakeClient();
  const result = await postLedgerEntry(client, {
    idempotencyKey: 'payment-capture:test',
    eventType: 'payment_capture',
    paymentIntentId: '11111111-1111-1111-1111-111111111111',
    postings: [
      { account: 'gateway_clearing', direction: 'debit', amountTomans: 1000 },
      { account: 'technician_payable', direction: 'credit', amountTomans: 850 },
      { account: 'escrow_liability', direction: 'credit', amountTomans: 150 }
    ]
  });
  assert.equal(result.duplicate, false);
  assert.equal(client.calls.filter((call) => call.sql.startsWith('INSERT INTO ledger_postings')).length, 3);
});

test('does not write a duplicate ledger event', async () => {
  const client = fakeClient({ duplicate: true });
  const result = await postLedgerEntry(client, {
    idempotencyKey: 'payment-capture:test',
    eventType: 'payment_capture',
    postings: [
      { account: 'gateway_clearing', direction: 'debit', amountTomans: 1000 },
      { account: 'technician_payable', direction: 'credit', amountTomans: 1000 }
    ]
  });
  assert.deepEqual(result, { id: 'existing-entry', duplicate: true });
  assert.equal(client.calls.length, 1);
});

test('rejects an unbalanced ledger event before writing it', async () => {
  const client = fakeClient();
  await assert.rejects(
    postLedgerEntry(client, {
      idempotencyKey: 'unbalanced',
      eventType: 'payment_capture',
      postings: [
        { account: 'gateway_clearing', direction: 'debit', amountTomans: 1000 },
        { account: 'technician_payable', direction: 'credit', amountTomans: 999 }
      ]
    }),
    /not balanced/
  );
  assert.equal(client.calls.length, 0);
});

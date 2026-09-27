import assert from 'node:assert/strict';
import test from 'node:test';
import { createZarinpalPayment, verifyZarinpalPayment } from '../src/zarinpal.js';

test('Zarinpal requests use sandbox and turn authority into checkout URL', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /sandbox\.zarinpal\.com\/pg\/v4\/payment\/request\.json$/);
    const body = JSON.parse(options.body);
    assert.equal(body.amount, 1250000);
    return new Response(JSON.stringify({ data: { code: 100, authority: 'A0000000000000000000000000000012345' } }), { status: 200 });
  };
  const payment = await createZarinpalPayment({ merchantId: 'merchant', amountRials: 1250000, callbackUrl: 'https://api.example.com/callback', description: 'test', metadata: {}, sandbox: true });
  assert.match(payment.paymentUrl, /sandbox\.zarinpal\.com\/pg\/StartPay\/A000/);
});

test('Zarinpal verify treats code 101 as an idempotent success', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ data: { code: 101, ref_id: 12345 } }), { status: 200 });
  const result = await verifyZarinpalPayment({ merchantId: 'merchant', amountRials: 1250000, authority: 'A000', sandbox: true });
  assert.equal(result.alreadyVerified, true);
  assert.equal(result.refId, '12345');
});

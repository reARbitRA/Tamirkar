// Preloaded into the server process with `node --import` so the Zarinpal capture path can be
// executed without reaching the real gateway. Nothing in src/ changes: zarinpal.js calls the global
// fetch, so intercepting it here is enough.
//
// Why this exists: sandbox.zarinpal.com is unreachable from the audit sandbox, so the 85/15 capture
// split, the escrow hold and the payment_capture ledger event had never actually run. Every claim
// about them was read off the source rather than executed. This makes them executable.
//
// The stub is deliberately narrow: it answers only the two Zarinpal endpoints and passes everything
// else through untouched, so a test using it still exercises the real database, the real routes and
// the real ledger.
import { readFileSync, writeFileSync } from 'node:fs';

const REQUEST_URL = 'https://sandbox.zarinpal.com/pg/v4/payment/request.json';
const VERIFY_URL = 'https://sandbox.zarinpal.com/pg/v4/payment/verify.json';

// Where the stub records what it was asked, so a test can assert on the outbound contract
// (amount in rials, merchant id) rather than only on what came back.
const LOG = process.env.ZARINPAL_STUB_LOG;

const realFetch = globalThis.fetch;

function record(entry) {
  if (!LOG) return;
  try {
    let prior = [];
    try { prior = JSON.parse(readFileSync(LOG, 'utf8')); } catch { /* first call */ }
    prior.push(entry);
    writeFileSync(LOG, JSON.stringify(prior, null, 2));
  } catch { /* never let bookkeeping break the request */ }
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url ?? String(input);

  if (url === REQUEST_URL) {
    const body = JSON.parse(init.body ?? '{}');
    record({ call: 'request', amountRials: body.amount, merchantId: body.merchant_id, callbackUrl: body.callback_url });
    // Zarinpal's success envelope. `code: 100` is what createZarinpalPayment requires.
    return new Response(JSON.stringify({ data: { code: 100, authority: process.env.ZARINPAL_STUB_AUTHORITY ?? 'STUBAUTHORITY0000000001' } }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  }

  if (url === VERIFY_URL) {
    const body = JSON.parse(init.body ?? '{}');
    record({ call: 'verify', amountRials: body.amount, authority: body.authority, merchantId: body.merchant_id });
    // A test can force a specific verification outcome to exercise the failure branches.
    const code = Number(process.env.ZARINPAL_STUB_VERIFY_CODE ?? 100);
    if (code !== 100 && code !== 101) {
      return new Response(JSON.stringify({ data: { code }, errors: { message: 'stubbed verification failure' } }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ data: { code, ref_id: process.env.ZARINPAL_STUB_REF_ID ?? 'STUB-REF-1' } }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  }

  return realFetch(input, init);
};

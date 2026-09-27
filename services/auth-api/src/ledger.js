import crypto from 'node:crypto';

function assertBalanced(postings) {
  const debit = postings.filter((p) => p.direction === 'debit').reduce((sum, p) => sum + p.amountTomans, 0);
  const credit = postings.filter((p) => p.direction === 'credit').reduce((sum, p) => sum + p.amountTomans, 0);
  if (debit !== credit) throw new Error('Ledger posting is not balanced');
}

/** Atomically records a balanced, idempotent accounting event. */
export async function postLedgerEntry(client, { idempotencyKey, eventType, paymentIntentId = null, orderReference = null, metadata = {}, postings }) {
  assertBalanced(postings);
  const existing = await client.query('SELECT id FROM ledger_entries WHERE idempotency_key = $1', [idempotencyKey]);
  if (existing.rows[0]) return { id: existing.rows[0].id, duplicate: true };

  const entryId = crypto.randomUUID();
  await client.query(
    `INSERT INTO ledger_entries (id, idempotency_key, event_type, payment_intent_id, order_reference, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [entryId, idempotencyKey, eventType, paymentIntentId, orderReference, JSON.stringify(metadata)]
  );
  for (const posting of postings) {
    await client.query(
      `INSERT INTO ledger_postings (id, entry_id, account, direction, amount_tomans)
       VALUES ($1, $2, $3, $4, $5)`,
      [crypto.randomUUID(), entryId, posting.account, posting.direction, posting.amountTomans]
    );
  }
  return { id: entryId, duplicate: false };
}

export async function audit(client, { actorUserId = null, action, subjectType, subjectId, metadata = {} }) {
  await client.query(
    `INSERT INTO operational_audit_log (id, actor_user_id, action, subject_type, subject_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [crypto.randomUUID(), actorUserId, action, subjectType, String(subjectId), JSON.stringify(metadata)]
  );
}

-- Read-path indexes for the server-backed order history and the operational audit trail.
-- Non-destructive: CREATE INDEX CONCURRENTLY cannot run inside a transaction, so these use
-- IF NOT EXISTS inside the migration transaction instead. On a large production table, apply
-- them CONCURRENTLY by hand first; the IF NOT EXISTS makes this migration a no-op afterwards.

CREATE INDEX IF NOT EXISTS operational_audit_log_actor_idx
    ON operational_audit_log (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS operational_audit_log_subject_idx
    ON operational_audit_log (subject_type, subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS operational_audit_log_action_idx
    ON operational_audit_log (action, created_at DESC);

CREATE INDEX IF NOT EXISTS job_evidence_order_technician_idx
    ON job_evidence (order_id, technician_id, phase);

CREATE INDEX IF NOT EXISTS quotes_technician_created_idx
    ON quotes (technician_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_intents_authority_idx
    ON payment_intents (authority);

-- Retention lookups: expired challenges and settled holds are the two tables that grow forever.
CREATE INDEX IF NOT EXISTS otp_challenges_created_idx
    ON otp_challenges (created_at);
CREATE INDEX IF NOT EXISTS escrow_holds_status_created_idx
    ON escrow_holds (status, created_at);

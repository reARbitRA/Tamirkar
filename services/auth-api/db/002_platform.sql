-- Operational foundation for public launch: immutable money events, payment authorities,
-- technician review state, and audit records.  Existing auth schema is 001_auth.sql.

CREATE TABLE IF NOT EXISTS technician_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    verification_status TEXT NOT NULL DEFAULT 'unsubmitted'
      CHECK (verification_status IN ('unsubmitted', 'submitted', 'under_review', 'approved', 'rejected', 'suspended')),
    suspension_reason TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kyc_cases (
    id UUID PRIMARY KEY,
    technician_id UUID NOT NULL REFERENCES users(id),
    status TEXT NOT NULL CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'suspended')),
    document_reference TEXT NOT NULL,
    document_hash CHAR(64) NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users(id),
    decision_reason TEXT
);
CREATE INDEX IF NOT EXISTS kyc_cases_technician_created_idx ON kyc_cases (technician_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS payment_intents (
    id UUID PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES users(id),
    technician_id UUID REFERENCES users(id),
    provider TEXT NOT NULL CHECK (provider IN ('zarinpal')),
    amount_tomans BIGINT NOT NULL CHECK (amount_tomans > 0),
    amount_rials BIGINT NOT NULL CHECK (amount_rials = amount_tomans * 10),
    description TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    authority TEXT UNIQUE,
    provider_ref_id TEXT UNIQUE,
    status TEXT NOT NULL CHECK (status IN ('created', 'pending', 'paid', 'failed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY,
    idempotency_key TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL CHECK (event_type IN ('payment_capture', 'technician_payable', 'escrow_hold', 'escrow_release', 'refund', 'dispute_freeze')),
    payment_intent_id UUID REFERENCES payment_intents(id),
    order_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ledger_postings (
    id UUID PRIMARY KEY,
    entry_id UUID NOT NULL REFERENCES ledger_entries(id),
    account TEXT NOT NULL CHECK (account IN ('gateway_clearing', 'customer_refund_payable', 'technician_payable', 'escrow_liability', 'platform_revenue')),
    direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
    amount_tomans BIGINT NOT NULL CHECK (amount_tomans > 0)
);
CREATE INDEX IF NOT EXISTS ledger_postings_entry_idx ON ledger_postings (entry_id);

CREATE TABLE IF NOT EXISTS escrow_holds (
    id UUID PRIMARY KEY,
    payment_intent_id UUID NOT NULL UNIQUE REFERENCES payment_intents(id),
    customer_id UUID NOT NULL REFERENCES users(id),
    technician_id UUID REFERENCES users(id),
    amount_tomans BIGINT NOT NULL CHECK (amount_tomans > 0),
    release_after TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('held', 'frozen', 'released', 'refunded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS escrow_holds_due_idx ON escrow_holds (status, release_after);

CREATE TABLE IF NOT EXISTS operational_audit_log (
    id UUID PRIMARY KEY,
    actor_user_id UUID REFERENCES users(id),
    action TEXT NOT NULL,
    subject_type TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

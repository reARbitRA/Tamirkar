-- Server-authoritative booking/quote/evidence state. Quotes are immutable snapshots;
-- a revision creates a new row rather than mutating an accepted customer offer.

CREATE TABLE IF NOT EXISTS service_orders (
    id UUID PRIMARY KEY,
    customer_id UUID NOT NULL REFERENCES users(id),
    category TEXT NOT NULL CHECK (char_length(category) BETWEEN 2 AND 80),
    problem_description TEXT NOT NULL CHECK (char_length(problem_description) BETWEEN 3 AND 2000),
    status TEXT NOT NULL CHECK (status IN ('submitted', 'quoted', 'awaiting_payment', 'paid', 'in_progress', 'completed', 'disputed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS service_orders_customer_created_idx ON service_orders (customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES service_orders(id),
    technician_id UUID NOT NULL REFERENCES users(id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    status TEXT NOT NULL CHECK (status IN ('sent', 'accepted', 'superseded', 'declined', 'paid')),
    labor_tomans BIGINT NOT NULL CHECK (labor_tomans >= 0),
    parts_tomans BIGINT NOT NULL CHECK (parts_tomans >= 0),
    total_tomans BIGINT NOT NULL CHECK (total_tomans = labor_tomans + parts_tomans AND total_tomans > 0),
    warranty_days INTEGER NOT NULL CHECK (warranty_days BETWEEN 0 AND 365),
    line_items JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (order_id, revision)
);
CREATE INDEX IF NOT EXISTS quotes_order_created_idx ON quotes (order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS quote_acceptances (
    id UUID PRIMARY KEY,
    quote_id UUID NOT NULL UNIQUE REFERENCES quotes(id),
    customer_id UUID NOT NULL REFERENCES users(id),
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acceptance_ip INET
);

ALTER TABLE payment_intents ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES quotes(id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_paid_quote_idx ON payment_intents (quote_id) WHERE status IN ('pending', 'paid');

CREATE TABLE IF NOT EXISTS job_evidence (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES service_orders(id),
    technician_id UUID NOT NULL REFERENCES users(id),
    phase TEXT NOT NULL CHECK (phase IN ('before', 'after')),
    object_reference TEXT NOT NULL,
    object_hash CHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS job_evidence_order_phase_idx ON job_evidence (order_id, phase);

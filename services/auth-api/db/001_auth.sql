CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    phone_e164 TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'technician', 'operator', 'admin')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS otp_challenges (
    id UUID PRIMARY KEY,
    phone_e164 TEXT NOT NULL,
    code_hash CHAR(64) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('sending', 'pending', 'verified', 'failed', 'locked', 'expired')),
    attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts SMALLINT NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    provider_message_id TEXT,
    failure_reason TEXT
);

CREATE INDEX IF NOT EXISTS otp_challenges_phone_created_idx
    ON otp_challenges (phone_e164, created_at DESC);
CREATE INDEX IF NOT EXISTS otp_challenges_pending_idx
    ON otp_challenges (phone_e164, expires_at DESC)
    WHERE status = 'pending';

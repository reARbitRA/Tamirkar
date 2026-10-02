-- Reverse of 002_platform.sql.
-- DESTRUCTIVE: drops the entire escrow/ledger/KYC layer. Requires an explicit restore point.
-- Postings must go before the entries they belong to.
DROP TABLE IF EXISTS ledger_postings;
DROP TABLE IF EXISTS ledger_entries;
DROP TABLE IF EXISTS escrow_holds;
DROP TABLE IF EXISTS payment_intents;
DROP TABLE IF EXISTS kyc_cases;
DROP TABLE IF EXISTS technician_profiles;
DROP TABLE IF EXISTS operational_audit_log;

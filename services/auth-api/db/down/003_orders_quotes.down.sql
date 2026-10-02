-- Reverse of 003_orders_quotes.sql.
-- DESTRUCTIVE: drops orders, quotes, evidence and acceptances, and removes the quote link from
-- payment_intents. Requires an explicit restore point.
DROP INDEX IF EXISTS payment_intents_paid_quote_idx;
ALTER TABLE payment_intents DROP COLUMN IF EXISTS quote_id;
DROP TABLE IF EXISTS quote_acceptances;
DROP TABLE IF EXISTS job_evidence;
DROP TABLE IF EXISTS quotes;
DROP TABLE IF EXISTS service_orders;

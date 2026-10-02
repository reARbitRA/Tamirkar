-- Reverse of 004_operational_indexes.sql. Purely additive index removal; no data is lost.
DROP INDEX IF EXISTS escrow_holds_status_created_idx;
DROP INDEX IF EXISTS job_evidence_order_technician_idx;
DROP INDEX IF EXISTS operational_audit_log_action_idx;
DROP INDEX IF EXISTS operational_audit_log_actor_idx;
DROP INDEX IF EXISTS operational_audit_log_subject_idx;
DROP INDEX IF EXISTS otp_challenges_created_idx;
DROP INDEX IF EXISTS payment_intents_authority_idx;
DROP INDEX IF EXISTS quotes_technician_created_idx;

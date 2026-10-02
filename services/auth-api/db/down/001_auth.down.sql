-- Reverse of 001_auth.sql. DESTRUCTIVE: drops all accounts and OTP challenges.
DROP INDEX IF EXISTS otp_challenges_pending_idx;
DROP INDEX IF EXISTS otp_challenges_phone_created_idx;
DROP TABLE IF EXISTS otp_challenges;
DROP TABLE IF EXISTS users;

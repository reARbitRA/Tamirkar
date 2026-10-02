-- Reverse of 005_devices.sql. Drops the device passport.
-- DESTRUCTIVE for device history, but the escrow ledger is untouched so money accounting is intact.
DROP INDEX IF EXISTS idx_service_orders_device;
ALTER TABLE service_orders DROP COLUMN IF EXISTS device_id;
DROP TABLE IF EXISTS customer_devices;

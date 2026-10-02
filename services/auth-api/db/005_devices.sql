-- Device passport. The Android app declared a Room `devices` table and a full
-- DeviceEntity (Entities.kt:56-73) but the server had no /v1/devices route at all, so every
-- device row existed only inside one handset: a reinstall or a lost phone deleted the customer's
-- whole service history, and no technician could see a device's history before quoting.
--
-- health_score is stored, not derived: it is shown on the passport card and recomputed only when
-- a service event lands, so the read path stays a single indexed scan.

CREATE TABLE IF NOT EXISTS customer_devices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  category          TEXT NOT NULL CHECK (category IN ('ac','washer','refrigerator','mobile','laptop','car','other')),
  brand             TEXT NOT NULL CHECK (char_length(brand) BETWEEN 1 AND 80),
  model             TEXT NOT NULL DEFAULT '' CHECK (char_length(model) <= 120),
  serial_number     TEXT NOT NULL DEFAULT '' CHECK (char_length(serial_number) <= 120),
  purchase_date     TEXT NOT NULL DEFAULT '' CHECK (char_length(purchase_date) <= 30),
  purchase_price    BIGINT NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  health_score      INT  NOT NULL DEFAULT 100 CHECK (health_score BETWEEN 0 AND 100),
  last_service_date TEXT NOT NULL DEFAULT '' CHECK (char_length(last_service_date) <= 30),
  service_count     INT  NOT NULL DEFAULT 0 CHECK (service_count >= 0),
  device_image_url  TEXT NOT NULL DEFAULT '' CHECK (char_length(device_image_url) <= 2048),
  notes             TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The list screen filters by owner and sorts by health_score ASC (TamirkarDao.kt:37).
CREATE INDEX IF NOT EXISTS idx_customer_devices_customer_health
  ON customer_devices (customer_id, health_score) WHERE is_active = TRUE;

-- A device passport is only useful if a technician can see the device's service history while
-- quoting, so link orders to the device that was worked on.
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES customer_devices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_device ON service_orders (device_id) WHERE device_id IS NOT NULL;

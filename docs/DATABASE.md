# Database Schema & Data Models — Tamirkar (تعمیرکار)

## 📊 Overview
All financial transactions are stored in **Tomans (تومان)** as 64-bit integers (`Long` in Kotlin / `bigint` in SQL) to prevent floating-point inaccuracies. All timestamps are UTC with Asia/Tehran timezone formatting.

---

## 🗄️ Database Tables & Entities

### 1. `users` (`UserEntity`)
- `id` (String / UUID): Primary key.
- `phone` (String): Iranian mobile number (`09xxxxxxxxx`).
- `full_name` (String): Display name.
- `role` (String): `customer`, `technician`, `admin`.
- `wallet_balance` (Long): Spendable balance in Tomans.
- `escrow_balance` (Long): Amount held in warranty escrow lockbox.
- `city` (String): Default 'Tehran'.
- `is_verified` (Boolean): OTP phone verified.
- `referral_code` (String): 8-character unique invite code.
- `created_at` (Long): Registration timestamp.

### 2. `technicians` (`TechnicianEntity`)
- `id` (String): Primary key.
- `user_id` (String): Linked user.
- `specialties` (String): Comma-separated categories (`mobile,ac,washer,tv,car,refrigerator`).
- `experience_years` (Int): Years of professional repair work.
- `rating` (Float): Weighted rating (1.0 to 5.0).
- `total_jobs` (Int): Lifetime assigned jobs.
- `completed_jobs` (Int): Successfully resolved jobs.
- `warranty_compliance_rate` (Float): Percentage of warranty claims resolved without dispute.
- `avg_response_minutes` (Int): Average ETA to accept jobs.
- `level` (String): `apprentice` (20% fee), `specialist` (16% fee), `master` (14% fee), `superstar` (12% fee).
- `xp_points` (Int): Gamified XP gained per completed job.
- `bank_sheba` (String): Iranian IBAN (IR...).
- `is_online` (Boolean): Real-time availability flag.
- `current_lat` (Double), `current_lng` (Double): Location coordinates.

### 3. `devices` (`DeviceEntity`) — Digital Passport
- `id` (String): Unique device identifier.
- `user_id` (String): Owner user ID.
- `name` (String): e.g., "یخچال ساید بای ساید ال‌جی", "آیفون ۱۵ پرو".
- `category` (String): `mobile`, `laptop`, `ac`, `washer`, `tv`, `car`, `refrigerator`, `dishwasher`, `water_heater`.
- `brand` (String): e.g., "سامسونگ", "ال‌جی", "اپل", "بوش".
- `model` (String): Model code or name.
- `serial_number` (String): Serial or IMEI.
- `purchase_date` (String): Date of purchase.
- `purchase_price` (Long): Value in Tomans.
- `health_score` (Int): 0 to 100% computed health score.
- `last_service_date` (String): Last serviced timestamp.
- `service_count` (Int): Number of past repairs recorded.
- `device_image_url` (String): Photo URL or local resource.
- `notes` (String): User or technician notes.

### 4. `orders` (`OrderEntity`)
- `id` (String): Order UUID.
- `order_number` (String): Formatted order identifier (e.g., `TK-240819-4821`).
- `customer_id` (String): Ordering user.
- `technician_id` (String?): Assigned technician.
- `device_id` (String?): Linked digital passport device.
- `category` (String): Device category.
- `problem_description` (String): Detailed symptom description.
- `problem_images` (String): Photo list.
- `ai_diagnosis_summary` (String): Gemini diagnostic synopsis.
- `ai_confidence_score` (Float): AI diagnosis confidence percentage.
- `estimated_price_min` (Long), `estimated_price_max` (Long): Estimated Tomans range.
- `final_price` (Long): Agreed total cost in Tomans.
- `parts_cost` (Long): Cost of replacement parts.
- `labor_cost` (Long): Labor fee.
- `escrow_amount` (Long): 15% warranty escrow held in vault.
- `platform_commission` (Long): Platform commission deducted from labor.
- `status` (String): `pending`, `ai_analyzing`, `matching`, `waiting_bids`, `accepted`, `on_way`, `arrived`, `diagnosing`, `repairing`, `completed`, `cancelled`, `disputed`.
- `order_mode` (String): `fast` or `bidding`.
- `customer_address` (String): Service address in Tehran/city.
- `customer_lat` (Double), `customer_lng` (Double): Geo coordinates.
- `warranty_days` (Int): Days of guarantee (default 30, up to 180).
- `before_images` (String), `after_images` (String): Work proof photos.
- `checklist_completed` (Boolean): SOP checklist verified.
- `quality_score` (Int): AI-audited quality score (0-100).
- `created_at` (Long), `completed_at` (Long?): Timestamps.

### 5. `bids` (`BidEntity`)
- `id` (String): Bid UUID.
- `order_id` (String): Target order.
- `technician_id` (String): Bidding technician.
- `proposed_price` (Long): Proposed cost in Tomans.
- `estimated_arrival_minutes` (Int): ETA.
- `message` (String): Technician's cover pitch.
- `status` (String): `pending`, `accepted`, `rejected`, `expired`.

### 6. `warranties` (`WarrantyEntity`)
- `id` (String): Warranty UUID.
- `order_id` (String): Connected order.
- `device_id` (String?): Connected device.
- `customer_id` (String), `technician_id` (String): Parties.
- `warranty_days` (Int): Duration in days.
- `starts_at` (Long), `expires_at` (Long): Active window.
- `status` (String): `active`, `claimed`, `expired`, `void`.
- `escrow_amount` (Long): Protected escrow funds.
- `claim_description` (String?): Defect report if filed.

### 7. `parts` (`PartEntity`) — Transparent Marketplace
- `id` (String): Part UUID.
- `name` (String): Persian name (e.g. "کمپرسور روتاری ۲۴۰۰۰ گری").
- `name_en` (String): English name.
- `category` (String): Category tag.
- `brand` (String): Part manufacturer brand.
- `quality_level` (String): `original` (اصلی), `grade_a` (درجه یک), `economy` (اقتصادی).
- `price` (Long): Price in Tomans.
- `stock_quantity` (Int): Available quantity.
- `rating` (Float): Customer satisfaction rating.
- `warranty_days` (Int): Return/replacement warranty days.

### 8. `transactions` (`TransactionEntity`) — Financial Ledger
- `id` (String): Transaction UUID.
- `user_id` (String): User account.
- `order_id` (String?): Associated order.
- `type` (String): `payment`, `commission`, `escrow_hold`, `escrow_release`, `refund`, `withdrawal`, `bonus`.
- `amount` (Long): Amount in Tomans.
- `balance_before` (Long), `balance_after` (Long): Balance audit trail.
- `description` (String): Persian statement text.
- `reference_id` (String): Bank or internal reference code.
- `status` (String): `completed`, `pending`, `failed`.
- `created_at` (Long): Timestamp.

### 9. `disputes` (`DisputeEntity`)
- `id` (String): Dispute UUID.
- `order_id` (String): Disputed order.
- `raised_by` (String), `against_id` (String): Participant IDs.
- `description` (String): Customer claim details.
- `ai_verdict` (String): Gemini autonomous arbitration finding.
- `ai_confidence` (Float): Confidence score (0-100%).
- `recommended_action` (String): `full_refund`, `partial_refund`, `revisit_free`, `no_action`.
- `status` (String): `open`, `ai_reviewed`, `resolved`, `closed`.

### 10. `sop_checklists` (`SopChecklistEntity`)
- `id` (String): Checklist ID.
- `category` (String): Appliance/category code.
- `title` (String): Persian title.
- `steps_json` (String): JSON array of required inspection steps, photo checks, and measurements.

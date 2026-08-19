# تعمیرکار (Tamirkar) — Super-App Documentation
> **هر وسیله یک پرونده، هر تعمیر یک ضمانت**
> Version: 1.0.0-MVP | Market: Iran (Tehran & Major Cities) | Language: Persian UI + English Codebase

---

## 📌 Executive Summary
**تعمیرکار (Tamirkar)** is an AI-powered end-to-end device maintenance and repair super-platform. It bridges customers with verified technical masters, provides a **Digital Passport (پاسپورت دیجیتال)** for every appliance and vehicle, enforces a **15% Escrow Warranty Guarantee (ضمانت اجرایی)**, operates a **Transparent Spare Parts Marketplace (بازار قطعه شفاف)**, and leverages **Google Gemini AI** across 8 specialized autonomous agents.

---

## 🏛️ Core Pillars

1. **Digital Passport (پاسپورت دیجیتال)**:
   - Every home appliance, smartphone, laptop, AC, refrigerator, or vehicle has a cryptographic timeline of purchase date, parts replaced, health score (0-100%), and maintenance alerts.
2. **Executable Warranty & Escrow (ضمانت اجرایی با امانی)**:
   - 15% of the total repair fee is held in escrow until the warranty period (e.g. 30 to 180 days) elapses without dispute. If a defect recurs, free revisit or refund is guaranteed.
3. **AI-First Smart Diagnosis (تشخیص هوشمند)**:
   - Customers upload photos, describe symptoms, or record engine/compressor noises. Gemini multimodal intelligence diagnoses root causes, estimates prices in Tomans (تومان), suggests DIY fixes or recommends parts.
4. **Transparent Spare Parts Marketplace (بازار قطعه شفاف)**:
   - Tiered part options: *Original (اصلی)*, *Grade A (درجه یک)*, and *Economy (اقتصادی)* with verified pricing and warranties.
5. **Verified Technician Hierarchy & SOP (تعمیرکاران تأییدشده و چک‌لیست)**:
   - Technician gamification levels (*Apprentice*, *Specialist*, *Master*, *Superstar*), dynamically reducing platform commission from 20% to 12% as XP increases.
   - Enforced Standard Operating Procedure (SOP) with mandatory before/after photos.

---

## 📁 Repository Structure
```
tamirkar/
├── docs/
│   ├── README.md               # Main Project Documentation
│   ├── ARCHITECTURE.md         # Clean Architecture, MVVM & Data Flows
│   ├── DATABASE.md             # Complete Schema & Room/Supabase Mappings
│   ├── API.md                  # REST, Gemini & Payment Gateway APIs
│   ├── AI_AGENTS.md            # Complete 8 Gemini Agents Specification
│   ├── BUSINESS_LOGIC.md       # Escrow, Commission, Warranty & XP Rules
│   ├── SCREENS.md              # Screen Catalogs & User Journeys
│   ├── DEPLOYMENT.md           # Build & Deployment Guidelines
│   ├── ENVIRONMENT.md          # Environment Variables & Secrets
│   ├── TESTING.md              # Robolectric, Unit & Screenshot Tests
│   └── CHANGELOG.md            # Version Release Notes
├── app/
│   ├── src/main/java/com/example/
│   │   ├── data/               # Room Entities, DAOs, Database, Seed Data
│   │   ├── domain/             # Models, Repositories, Business Calculators
│   │   ├── network/            # Gemini AI Client, REST services
│   │   ├── ui/
│   │   │   ├── auth/           # Phone OTP, Profile Setup
│   │   │   ├── home/           # Dashboard, Category Grid, Health Overview
│   │   │   ├── diagnosis/      # Multimodal AI Diagnostic Tool
│   │   │   ├── orders/         # Booking, Radar Match, Tracking, Detail
│   │   │   ├── devices/        # Digital Passport Hub & Add Device
│   │   │   ├── warranty/       # Active Guarantees & Dispute Filer
│   │   │   ├── parts/          # Spare Parts Catalog
│   │   │   ├── wallet/         # Tomans Ledger & Escrow Vault
│   │   │   ├── technician/     # Technician Mode: SOP, Radar, Earnings, Academy
│   │   │   ├── support/        # Multi-turn Gemini Repair Assistant
│   │   │   └── theme/          # Material 3 Persian RTL Palette & Typography
└── metadata.json
```

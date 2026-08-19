# Screens & Navigation Catalog — Tamirkar (تعمیرکار)

## 📱 Screen Navigation Directory

### Auth & Onboarding Flow
1. `SplashScreen` (`/splash`): Animated brand mark, core tagline, and session check.
2. `PhoneAuthScreen` (`/auth/phone`): Iranian phone number validator (`09...`), terms agreement.
3. `OtpScreen` (`/auth/otp`): 6-digit PIN input with 60-second countdown and auto-verify.
4. `ProfileSetupScreen` (`/auth/setup`): Full name, city dropdown (Tehran, Karaj, Isfahan, Mashhad, etc.), role switcher.

### Customer Super-App Flow
5. `HomeScreen` (`/home`):
   - AI Diagnosis Quick Banner.
   - 6 Major Category Grid (Mobile, AC, Washer, Refrigerator, TV, Car).
   - Digital Passport Device Health Cards.
   - Active Orders Live Tracker Widget.
   - Smart Service Reminders.
6. `DiagnosisScreen` (`/diagnose`):
   - Camera photo upload & symptom selection.
   - Gemini multimodal diagnosis execution.
   - DIY Guide vs Instant Technician Booking.
7. `NewOrderScreen` (`/order/new`):
   - Step 1: Problem summary & photos.
   - Step 2: Mode selection (*Fast Match* vs *Competitive Bidding*).
   - Step 3: Service Address & Scheduling.
   - Step 4: Price estimate & Escrow guarantee pledge.
8. `OrderMatchingScreen` (`/order/match/{id}`):
   - Radar sonar animation searching local specialists.
   - Incoming competitive bids with ETA, ratings, and price in Tomans.
9. `OrderTrackingScreen` (`/order/track/{id}`):
   - Map preview with technician location.
   - 5-stage status progress tracker (*Matching -> On Way -> Arrived -> Repairing -> Completed*).
   - Call & Live Chat actions.
10. `OrderDetailScreen` (`/order/{id}`):
    - Digital invoice with transparent Tomans itemization.
    - Before & After work photos.
    - Active Warranty certificate with QR badge.
    - Rating & review submission.
11. `DevicesListScreen` (`/devices`): Digital Passport overview of all registered devices with health meters.
12. `DevicePassportScreen` (`/devices/{id}`): Detailed service ledger, part replacements history, active warranties.
13. `AddDeviceScreen` (`/devices/add`): Add new appliance/vehicle with category, brand, model, and purchase date.
14. `WarrantyScreen` (`/warranty`): Active guarantees, expiry countdowns, 1-tap AI dispute filing.
15. `PartsMarketplaceScreen` (`/parts`): Spare parts search, Original / Grade A / Economy quality tiers, direct purchase.
16. `WalletScreen` (`/wallet`): Available balance, 15% Escrow Vault, transaction ledger, deposit/withdraw flows.
17. `ProfileScreen` (`/profile`): User settings, role toggle to Technician Mode, support button.
18. `SupportChatScreen` (`/support`): Interactive Gemini repair chatbot with context memory and escalation.

### Technician App Flow
19. `TechnicianDashboardScreen` (`/tech/dash`): Big Online/Offline availability toggle, Today's earnings in Tomans, XP progress bar.
20. `JobRequestScreen` (`/tech/job_request/{id}`): Incoming job alert with 30s acceptance timer, customer address, and AI diagnosis.
21. `ActiveJobScreen` (`/tech/job/{id}`): Category SOP checklist, mandatory Before & After photo uploads, parts logging, final invoice generation.
22. `TechnicianEarningsScreen` (`/tech/earn`): Financial statistics, 15% escrow release timeline, Sheba withdrawal.
23. `TechnicianTrainingScreen` (`/tech/train`): Micro-lessons, safety exams, and Master certifications.

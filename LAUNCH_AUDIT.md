# VERDICT: NO-GO

**Audit date:** 2026-09-25  
**Scope:** Oosta / اوستا Android repository at `arena/01a0d875-tamirkar`  
**Verdict rationale:** This is a local-first Compose prototype with useful demo UI and a source-level AI router, but it has no production backend, authentication, payment integration, escrow release process, KYC, admin tooling, file upload, operational controls, or legal material. The money and trust promises are therefore unshippable. The local test/build command could not be executed in this audit workstation because no JDK is installed; the CI configuration also does not subscribe to the active branch.

## Evidence and command record

| Command | Result | Evidence |
| --- | --- | --- |
| `./gradlew tasks --all` | **exit 1** | `JAVA_HOME is not set and no 'java' command could be found in PATH` |
| `./gradlew testDebugUnitTest` | **exit 1** | Same missing-JDK error; no unit/instrumented results or coverage can be claimed. |
| `git grep` secret-pattern scan | **exit 0; no current credential found** | `.env.example` contains placeholders only. Full-history scan found the placeholder `AIzaSy...`, not a complete secret. |
| `git diff --check` | **pass** | Branding working tree has no whitespace errors. |
| XML/SVG/JSON parse check | **pass** | Android resource XML, social SVG, and `metadata.json` parsed successfully. |
| Repository inventory | **complete** | One Android app, Room local database, no server/container/worker/cron/deployable backend detected. |

**Audit limitation:** This environment lacks Java and Android SDK, so APK assembly, tests, lint, instrumentation, performance, dependency CVE scan, and emulator testing were **not verifiable**. No Docker Compose or migration service exists to run.

**GitHub tracking note:** Audit issues were created as #3–#18. The connected GitHub integration allowed issue creation and label creation but returned `403 Resource not accessible by integration` when attaching labels or editing the issue body after creation. The full evidence and remediation for every issue is canonical in this file; a repository admin should apply the requested labels (`blocker`, `security`, `money`, `i18n-fa`, `iran-access`, `ops`, `legal`, `mvp`) and replace the generated issue body with its matching audit section.

## Readiness scorecard

| Area | Score / 100 | Evidence-based assessment |
| --- | ---: | --- |
| Build reproducibility | 10 | CI has JDK 17 setup, but its branch filter does not include the active Arena branch; local Gradle cannot start. |
| Core journeys | 15 | Customer/demo navigation exists, but essential real-user journeys are hard-coded or local-only. |
| Money / escrow | 0 | No payment provider, webhook, hold/release ledger, or atomic settlement. |
| Security | 10 | No backend authz boundary exists; API keys are designed to be placed in the APK BuildConfig. |
| Persian / RTL | 40 | Persian UI and Persian currency formatting exist; dates, i18n resources, full RTL QA and input normalisation are incomplete. |
| Iran reachability | 5 | Runtime inference depends on Google/Groq/Cerebras/Hugging Face/OpenRouter; no domestic fallback or reachability test. |
| Ops / observability | 0 | No backend, health endpoint, monitoring, backup/restore or incident process. |
| Legal / docs | 10 | Product docs exist; no terms, privacy, cancellation/refund policy, licence, or vulnerability disclosure. |
| Test coverage | 10 | Four unit-test source files and one instrumented file exist; execution/coverage unavailable and no money E2E test. |
| Performance / accessibility | 5 | Compose semantics exist in places; no measured release APK, accessibility audit or network test. |

---

## Inventory: what actually runs

- **Client:** Kotlin/Jetpack Compose Android application; entry activity is `app/src/main/java/com/example/MainActivity.kt:63`.
- **Navigation:** a local `NavHost`; its start destination is `Screen.Home` at `MainActivity.kt:194-197`, bypassing sign-in.
- **Persistence:** an on-device Room database named `tamirkar_database`, `TamirkarDatabase.kt:47-56`. Database version is `1`, schema export is disabled, and destructive fallback is enabled at `TamirkarDatabase.kt:35-56`.
- **Networking:** direct client-side calls to model vendors only: Google Generative Language, Groq, Cerebras, Hugging Face, and OpenRouter in `AiProviderRouter.kt:82,101-104` and Gemini direct call at `GeminiAiEngine.kt:345`.
- **CI:** GitHub Actions Android build/test workflow at `.github/workflows/build.yml`; no deploy, release signing, staging, production environment, API, worker, queue, cron, or Docker Compose file was found.
- **Dead/vaporware signals:** Retrofit/Firebase App Check/Firebase AI dependencies are declared in `app/build.gradle.kts`, but the product has no server-side API or Firebase configuration file. The parts “buy” button is a no-op at `SecondaryScreens.kt:277-283`.

## Critical journey matrix

| Journey | Status | Evidence |
| --- | --- | --- |
| J1 Signup → OTP → profile/address | **STUBBED** | The app starts on Home (`MainActivity.kt:194-197`). Phone screen defaults to `09123456789` and only checks string length/prefix (`AuthScreens.kt:143,225-230`). OTP defaults to `123456` and always invokes success (`AuthScreens.kt:278,339-354`). |
| J2 Repair request with category/device/symptom/photo/audio | **PARTIAL** | Local order creation exists in `TamirkarRepository.kt:94-132`; diagnosis UI only toggles an `isRecordingAudio` state—no recorder/upload occurs (see `DiagnosisScreen.kt` matches at audio control). `OrderEntity.problemImages` is a string, `Entities.kt:87`. |
| J3 AI diagnosis, error/low-confidence fallback | **PARTIAL / UNSAFE** | Router tries configured providers with 20s/60s timeouts (`AiProviderRouter.kt:23-46`) and parser has static fallbacks (`GeminiAiEngine.kt:397-496`), but fallback confidence is high and no human escalation/uncertainty gate protects price output. |
| J4 Technician matching / accept / ETA | **STUBBED** | `generateSimulatedBids` fabricates three bids (`TamirkarRepository.kt:126-150`). Bid accept is a read-copy-write update without a conditional claim (`TamirkarRepository.kt:156-164`). |
| J5 Quote itemisation → approval → immutable snapshot | **MISSING** | Acceptance writes only `finalPrice` and `status` (`TamirkarRepository.kt:156-163`); no immutable quote entity, customer approval record, or server boundary. |
| J6 Parts tiers with price/warranty selection | **PARTIAL** | `PartEntity` models three quality levels and price/warranty (`Entities.kt:157-173`), but marketplace purchase is `onClick = {}` (`SecondaryScreens.kt:277-283`). |
| J7 Payment → 85% release / 15% hold | **MISSING** | Completion computes `escrowAmount` (`TamirkarRepository.kt:179-203`) but writes one synthetic `payment` transaction with hard-coded balance (`230-242`); no gateway or 85% technician payout. |
| J8 Timed escrow release / dispute freeze | **MISSING** | Entity enumerates `escrow_release` but no code produces it (`Entities.kt:180-191`; repository transaction inserts at `230-242,294-304`). No worker/cron exists. |
| J9 Dispute/refund | **PARTIAL / UNSAFE** | A dispute is saved and order marked disputed (`TamirkarRepository.kt:251-277`), but an AI result alone chooses a recommendation/refund amount; no actual refund, staff workflow, or freeze. |
| J10 Device passport permanent/exportable/tamper-evident | **PARTIAL** | Device entity and local UI exist (`Entities.kt:56-73`, `DevicesScreens.kt:249-294`), but no append-only repair-history table, export, signature, or non-destructive migration. |
| J11 Technician KYC / verification / suspension | **MISSING** | Technician records contain demo `isOnline`, rating, and bank Sheba fields (`Entities.kt:29-50`); no KYC document, approval state machine, suspension, or reviewer exists. |
| J12 Ratings/reviews + mandatory before/after evidence | **STUBBED** | Order fields exist (`Entities.kt:105-109`); star taps only change composable local state (`OrderDetailScreen.kt:260-290`), and evidence is not enforced. |
| J13 Admin recovery console | **MISSING** | No admin route/API found; role is merely a default string in `UserEntity` (`Entities.kt:10-22`). |

---

# 🔴 BLOCKERS

## B1. No real authentication, OTP delivery, or identity boundary

- **Why it kills launch:** Anyone using the APK reaches the customer home screen directly; the OTP is a prefilled local demo and there is no authenticated identity for money, device history, or access control.
- **Evidence:** `MainActivity.kt:194-197`, `AuthScreens.kt:143,225-230,278,339-354`, pervasive `user_default` / `tech_1` defaults in `TamirkarRepository.kt:29-32,84-87,111,248,286`.
- **Minimal fix:** Server-side OTP provider with rate limits, verified session tokens, role claims, account/address persistence, and client token storage. Require sign-in before protected navigation.
- **Effort / owner:** **L**, backend + Android + security.

## B2. Money and ۱۵٪ escrow are simulated, not held

- **Why it kills launch:** UI promises escrow while no external money moves, holds, releases, or refunds. The app fabricates balances and transaction reference IDs.
- **Evidence:** `TamirkarRepository.kt:179-242` computes a hold but inserts only one `type = "payment"` record; `depositWallet` describes a gateway but only mutates Room state at `289-304`; no payment URLs/webhooks were found.
- **Minimal fix:** Server-side double-entry ledger, payment-provider integration, signed webhook verifier, idempotency keys, authorise/capture/hold/release/refund states, and reconciled balances.
- **Effort / owner:** **L**, payments/backend/finance.

## B3. No escrow-release worker or dispute freeze

- **Why it kills launch:** Warranty expiry cannot release funds and disputes cannot reliably freeze them. This invalidates the defining trust promise.
- **Evidence:** `TransactionEntity` lists `escrow_hold` and `escrow_release` (`Entities.kt:180-191`) but repository inserts only `payment` records (`TamirkarRepository.kt:230-242,294-304`); no queue/worker/cron files exist.
- **Minimal fix:** Idempotent server worker keyed by escrow ID, explicit expiry/freeze state, durable job queue, retries/DLQ, audit log, and integration tests for double execution.
- **Effort / owner:** **L**, backend/finance/SRE.

## B4. No server-side authorisation or multi-user data isolation

- **Why it kills launch:** All records are local Room data and domain methods use fixed IDs; a production marketplace requires enforced ownership and technician/admin permissions.
- **Evidence:** Local Room is the only database (`TamirkarDatabase.kt:47-56`); default identity values appear in repository methods; `getTechnicianOrdersFlow` shows all matching/bidding work to a technician query (`TamirkarDao.kt:75-76`).
- **Minimal fix:** Backend API with authenticated claims, row/tenant ownership checks, scoped order/device/wallet queries, and IDOR tests.
- **Effort / owner:** **L**, backend/security.

## B5. API keys are intended to ship inside the APK

- **Why it kills launch:** Model vendor credentials in Android `BuildConfig` can be extracted and abused; direct client calls also expose PII and prevent secure policy enforcement.
- **Evidence:** `AiProviderRouter.kt:14,69-72` explicitly reads key fields from `BuildConfig`; direct requests include API key/bearer auth at `82` and `106-109`; `.env.example` documents client-bound keys.
- **Minimal fix:** Move all inference to a server-side gateway, issue user-scoped auth tokens, redact PII, rate-limit, log model decisions, and remove provider secrets from the client build.
- **Effort / owner:** **L**, backend/security/AI.

## B6. Matching, quote, and technician proof are demo data

- **Why it kills launch:** A customer can choose fabricated technicians and prices. There is no accepted-quote snapshot, KYC, availability source, or mandatory before/after proof.
- **Evidence:** simulated bids `TamirkarRepository.kt:126-150`; unguarded accept `156-164`; no-op parts purchase `SecondaryScreens.kt:277-283`; only fields—not enforcement—for photos at `Entities.kt:105-109`.
- **Minimal fix:** Server matching/offer schema, conditional accept transaction, signed quote revision, technician KYC state machine, evidence upload pipeline and completion validator.
- **Effort / owner:** **L**, backend/Android/operations.

## B7. AI diagnosis can present confident static answers with no safety or human fallback

- **Why it kills launch:** A timeout/malformed model reply falls back to category-wide advice with confidence values as high as 95%, despite no audio/photo analysis. This can cause unsafe or misleading repair/pricing advice.
- **Evidence:** static fallback confidence at `GeminiAiEngine.kt:434-496`; parser catches all exceptions and uses fallback at `397-431`; UI presents diagnosis flow as successful.
- **Minimal fix:** Add confidence provenance, safe minimum confidence threshold, explicit “preliminary/unverified” copy, human escalation, incident/safety rules, model evaluation set, and no-price result when evidence is insufficient.
- **Effort / owner:** **M**, AI/product/safety.

## B8. Device passport is not durable or tamper-evident

- **Why it kills launch:** The product promises a permanent trust record, but the database can destructively reset and a device only stores aggregate fields/notes.
- **Evidence:** `fallbackToDestructiveMigration()` at `TamirkarDatabase.kt:54-56`; no repair-history entity; `DeviceEntity` includes only one `notes` field (`Entities.kt:56-73`).
- **Minimal fix:** Server-backed append-only service-event ledger, versioned migrations, immutable event signatures/hashes, export, access policy and retention/deletion rules.
- **Effort / owner:** **L**, backend/data/security.

## B9. No legal, privacy, support, or operator path exists

- **Why it kills launch:** The app processes phones, addresses, device histories, AI inputs and payment claims without published user terms, privacy rules, cancellation/refund policy, consent, or reachable human support/admin process.
- **Evidence:** Repository has no `LICENSE`, privacy, terms, security, contributing, or code-of-conduct document; no admin destination in `MainActivity.kt:76-118`.
- **Minimal fix:** Persian legal pack reviewed for Iran, privacy/data-retention policy, consent screens, support channel/SLAs, human dispute console and incident escalation.
- **Effort / owner:** **M**, legal/ops/product.

---

# 🟠 SHOULD-FIX-BEFORE-LAUNCH

1. **Build/CI gate is not evidence-producing.** The active branch is not in workflow trigger filters (`.github/workflows/build.yml:5-6`), and tests could not run locally. Add branch-agnostic PR/push checks, JDK/toolchain bootstrap, lint, release build, and published test reports. **M / Android/DevEx.**
2. **Room operations are not atomic or concurrency-safe.** Read-copy-write in `acceptBid` (`TamirkarRepository.kt:156-164`) and multi-write completion (`172-242`) is not wrapped in a Room transaction; no DB constraints preserve state transitions. **M / backend/data.**
3. **Persian/Iran localisation is incomplete.** Strings are scattered in Kotlin, no Jalali date service exists, `scheduledAt` is a prose string, and Persian normalisation is absent. See `Entities.kt:65,68,102` and UI sources. **M / Android/i18n.**
4. **No operational resilience.** Backup rules are untouched templates (`res/xml/backup_rules.xml:1-13`, `data_extraction_rules.xml:1-19`); no metrics, error reporting, backups, restore test, health checks, or kill switch. **M / SRE/backend.**
5. **Iran reachability has no documented fallback.** Runtime calls Google/Groq/Cerebras/Hugging Face/OpenRouter directly (`AiProviderRouter.kt:51-62,101-104`), none is documented as Iran-reachable, and offline/3G behaviour has no queue/retry UX. **M / backend/product.**
6. **Test coverage is insufficient for trust paths.** There are a small number of source tests but no payment, escrow, auth, upload, KYC, or end-to-end tests. Test execution and coverage are unavailable. **M / QA/backend/Android.**
7. **Release hygiene is incomplete.** No signed release verification, SBOM/dependency audit, licence, release changelog discipline, store privacy declaration, or rollback process is present. **M / release/security.**

# 🟡 POST-LAUNCH WEEK 1

- Replace the current demo records with anonymised seed fixtures behind an explicit demo build flavour.
- Add accessibility QA for screen reader labels, focus order, dynamic type, contrast and RTL mirrored icons.
- Add product analytics that redact PII and track only consented funnel events.
- Establish model-quality monitoring by device category and a reviewer queue for low-confidence diagnoses.
- Measure release APK size, cold start and core screen rendering on a mid-range Android device over slow 3G.

# 🟢 VERIFIED BY SOURCE INSPECTION

- Monetary fields use integer `Long` in the Room model, e.g. `OrderEntity` at `Entities.kt:90-96`, `PartEntity.price` at `166`, and `TransactionEntity.amount` at `180-191`. This is a correct starting representation but does **not** make the payment flow safe.
- Persian-first UI copy and `android:supportsRtl="true"` exist (`AndroidManifest.xml:16`).
- The AI router has explicit connect/read timeouts and ordered candidate attempts (`AiProviderRouter.kt:23-46`). It has no production safety/availability proof.
- The new Oosta visual system includes text-safe SVG and pre-rendered assets in `brand/` and `.github/social-preview.png`.

# What could not be verified and why

- **Build, lint, unit/instrumented tests, coverage, APK size:** no JDK/Android SDK exists in this audit environment.
- **Cold start, real login, device permissions, RTL rendering, accessibility:** no emulator/device and no functional backend/SMS service.
- **Payment, escrow, webhooks, KYC, refunds, worker idempotency, backups, restore, staging/rollback:** no such services/configuration exist in the repository.
- **Dependency CVEs:** the expected Gradle dependency graph cannot be resolved without Java; no lockfile/SBOM/audit output exists.
- **Iran service reachability:** direct vendor calls are visible in source, but no in-Iran network test or domestic fallback contract is present.

# Top five ways Oosta loses money or trust on day one

1. It displays a ۱۵٪ escrow promise while no real hold or release exists.
2. It offers an OTP sign-in that is a prefilled local screen, then launches straight into a home screen anyway.
3. It sends secrets and potentially user diagnostic data directly from a reverse-engineerable APK to foreign AI vendors.
4. It presents simulated technician bids and confident fallback diagnosis as if they are live marketplace decisions.
5. It claims durable device history but stores it in a destructively migratable local database with no export or audit trail.

# If I had to launch this Friday, here are the 5 things I’d do first

1. **Do not launch payments or escrow.** Restrict the build to an explicitly labelled, no-money private demo.
2. Stand up a minimal authenticated backend with real OTP, rate limiting, role checks and server-side provider keys.
3. Implement one end-to-end, manually supervised service flow: quote approval → payment/hold → technician evidence → human-approved settlement.
4. Move device passport and order state to append-only server records; remove destructive migration and all hard-coded identities from release builds.
5. Add legal/support pages, a staffed escalation channel, CI checks on the actual release branch, and tested release/rollback gates.

# اوستا / Oosta

<p align="center">
  <img src=".github/social-preview.png" width="100%" alt="Oosta — اول تشخیص، بعد هزینه." />
</p>

> **اول تشخیص، بعد هزینه.**  
> *Diagnose first. Pay fair. Repair, don't replace.*

## Why Oosta exists

In a Tehran where the default answer to a broken machine is *«بنداز دور، نو بخر»*, Oosta follows **استاد کاوه**—the last apprentice of Kaveh the Blacksmith. Kaveh's leather apron once became a flag; here, the apron becomes a shield for honest diagnosis, transparent repair pricing, and durable repair records.

Oosta treats repair as sovereignty, not poverty. Its five promises are **گوشِ کاوه** (listening-led diagnosis), **شناسنامه** (a device passport), **پولِ امانت** (۱۵٪ escrow), **کشوی سه‌طبقه** (clear parts tiers), and **مُهر صنف** (verified technicians with evidence).

Read the full story in [docs/LORE.md](docs/LORE.md).

## Product surfaces

- Persian-first Android repair booking and technician matching UI
- Preliminary AI-assisted diagnosis and transparent price ranges
- Device passport and repair-history UI
- Parts tiers: اصلی · درجه‌یک · اقتصادی
- Warranty/dispute and ۱۵٪ escrow product flows

> **Status:** this repository is an early-stage Android prototype, not a launch-ready marketplace. See [LAUNCH_AUDIT.md](LAUNCH_AUDIT.md) and [docs/GO_NO_GO.md](docs/GO_NO_GO.md) for evidence-based launch risks.

## Brand assets

The primary **Apron Shield** app mark, Ostad Kaveh poster, social preview, palette, and production prompts live in [`brand/`](brand/). Start at [`brand/BRAND.md`](brand/BRAND.md).

## First real backend step: OTP login

The first production increment is deliberately small: `services/auth-api` handles Iranian mobile OTP through **Kavenegar Verify Lookup**. It is the only new backend service in this increment—payments, escrow, KYC, and AI remain out of scope.

Set up the Kavenegar template and local secrets using [`services/auth-api/README.md`](services/auth-api/README.md). The Android app reads only the non-secret `AUTH_API_BASE_URL`; Kavenegar credentials, the OTP pepper, JWT secret, and PostgreSQL password stay in the service environment.

## Development

The project is a Kotlin/Jetpack Compose Android app. The expected local test command is:

```bash
./gradlew testDebugUnitTest
```

Run the evidence-first automated readiness check before a release:

```bash
scripts/launch-readiness-audit.sh
# static-only mode for a workstation without Java/Android tooling
scripts/launch-readiness-audit.sh --no-build
```

It writes a timestamped report under `audit-output/` and exits `2` when it finds launch blockers. See [docs/README.md](docs/README.md) for product and architecture notes. CI provisions JDK 17 and Android SDK components in [`.github/workflows/build.yml`](.github/workflows/build.yml).

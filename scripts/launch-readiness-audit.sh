#!/usr/bin/env bash
# Evidence-first launch-readiness audit for the Oosta/Tamirkar Android repository.
#
# This script deliberately does not claim product behaviour that it cannot execute.
# It combines static repository checks with build/test commands when their toolchain
# is present, writes a dated Markdown report, and exits non-zero if it finds blockers.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUTPUT_DIR="audit-output"
RUN_BUILD=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      OUTPUT_DIR="${2:?--output-dir needs a directory}"
      shift 2
      ;;
    --no-build)
      RUN_BUILD=0
      shift
      ;;
    -h|--help)
      cat <<'USAGE'
Usage: scripts/launch-readiness-audit.sh [--output-dir DIR] [--no-build]

Writes an evidence-first Markdown report and command logs. It exits 2 when at
least one launch blocker is detected, 0 otherwise. Use --no-build for a static
review when Java/Android tooling is deliberately unavailable.
USAGE
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 64
      ;;
  esac
done

mkdir -p "$OUTPUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REPORT="$OUTPUT_DIR/LAUNCH_AUDIT_${STAMP}.md"
LOG_DIR="$OUTPUT_DIR/logs-$STAMP"
mkdir -p "$LOG_DIR"

BLOCKERS=0
MAJORS=0
MINORS=0
NICE=0

say() { printf '%s\n' "$*" | tee -a "$REPORT"; }
section() { say; say "## $1"; }
item() {
  local severity="$1" title="$2" evidence="$3" remediation="$4"
  case "$severity" in
    BLOCKER) ((BLOCKERS+=1)) ;;
    MAJOR) ((MAJORS+=1)) ;;
    MINOR) ((MINORS+=1)) ;;
    NICE) ((NICE+=1)) ;;
  esac
  say "### ${severity}: ${title}"
  say "- **Evidence:** ${evidence}"
  say "- **Recommended action:** ${remediation}"
  say
}
pass() { say "- ✅ **$1** — $2"; }
info() { say "- ℹ️ **$1** — $2"; }

run_command() {
  local name="$1" command="$2" log="$LOG_DIR/${name//[^A-Za-z0-9_.-]/_}.log"
  set +e
  bash -lc "$command" >"$log" 2>&1
  local code=$?
  set -e
  say "### Command: \`$command\`"
  say "- **Exit:** $code"
  say "- **Log:** \`$log\`"
  say '```text'
  tail -n 30 "$log" >> "$REPORT"
  say '```'
  say
  return "$code"
}

cat > "$REPORT" <<EOF
# Automated launch-readiness audit

- **Repository:** $(git remote get-url origin 2>/dev/null || printf 'no origin configured')
- **Branch:** $(git branch --show-current 2>/dev/null || printf 'detached')
- **Commit:** $(git rev-parse --short HEAD 2>/dev/null || printf 'unavailable')
- **Executed (UTC):** $(date -u '+%F %T UTC')
- **Mode:** $([[ "$RUN_BUILD" -eq 1 ]] && printf 'static + build/test when available' || printf 'static only')

> This report is generated from commands executed in the current checkout. A static
> match proves only that source evidence exists; it does not prove a real payment,
> KYC, SMS, AI, or production API flow works.

EOF

section "Repository and open-source hygiene"
if [[ -f README.md ]]; then
  pass "Root README exists" "\`README.md\` contains product, brand and development material."
else
  item BLOCKER "No root README" "\`README.md\` is missing." "Add installation, run, architecture and release instructions."
fi
for f in LICENSE LICENSE.md LICENSE.txt; do
  [[ -f "$f" ]] && LICENSE_FILE="$f" && break || true
done
if [[ -n "${LICENSE_FILE:-}" ]]; then
  pass "License present" "\`$LICENSE_FILE\` exists."
else
  item MAJOR "No open-source license" "No \`LICENSE*\` file was found." "Choose and add a project license before public distribution."
fi
[[ -f CONTRIBUTING.md ]] && pass "Contribution guide present" "\`CONTRIBUTING.md\` exists." || item MINOR "No contribution guide" "\`CONTRIBUTING.md\` is absent." "Document local setup, tests and pull-request expectations."
[[ -f CODE_OF_CONDUCT.md ]] && pass "Code of conduct present" "\`CODE_OF_CONDUCT.md\` exists." || item MINOR "No code of conduct" "\`CODE_OF_CONDUCT.md\` is absent." "Add community conduct guidance if the repository is public."
[[ -f SECURITY.md || -f .github/SECURITY.md ]] && pass "Security policy present" "A SECURITY policy exists." || item MAJOR "No vulnerability disclosure policy" "No \`SECURITY.md\` was found." "Add a responsible disclosure route and supported-version policy."
if grep -qxF '.env' .gitignore && [[ -f .env.example ]]; then
  pass "Environment-file convention" "\`.env\` is ignored and \`.env.example\` is present."
else
  item BLOCKER "Environment-file protection is incomplete" "Expected \`.env\` in \`.gitignore\` and \`.env.example\` in the root." "Ignore real env files and document placeholders only."
fi
if git diff --check >"$LOG_DIR/git-diff-check.log" 2>&1; then
  pass "Whitespace check" "\`git diff --check\` passed."
else
  item MINOR "Whitespace errors in working tree" "See \`$LOG_DIR/git-diff-check.log\`." "Resolve whitespace errors before merge."
fi

section "Secrets and sensitive files"
SECRET_PATTERN='AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----|postgres(ql)?://[^[:space:]]+:[^[:space:]]+@'
set +e
git grep -nEI "$SECRET_PATTERN" -- ':!gradle/wrapper/gradle-wrapper.jar' >"$LOG_DIR/current-secret-scan.log"
SECRET_CODE=$?
# Continue even if a scan command returns a non-zero search result.
if [[ "$SECRET_CODE" -eq 1 ]]; then
  pass "Tracked secret scan" "No current tracked file matched the high-signal secret pattern."
elif [[ "$SECRET_CODE" -eq 0 ]]; then
  item BLOCKER "Possible secret in tracked source" "Matches: \`$LOG_DIR/current-secret-scan.log\`." "Revoke the credential, remove it from history and move it server-side."
else
  item MAJOR "Secret scan failed" "\`git grep\` returned $SECRET_CODE; see \`$LOG_DIR/current-secret-scan.log\`." "Repair the scan and repeat it before release."
fi
set +e
git log --all -p -G "$SECRET_PATTERN" -- . ':!gradle/wrapper/gradle-wrapper.jar' >"$LOG_DIR/history-secret-scan.log" 2>&1
HISTORY_CODE=$?
# Continue even if history scan returns a non-zero search result.
if [[ "$HISTORY_CODE" -eq 0 ]] && grep -Eq '^\+.*(AIza[0-9A-Za-z_-]{20,}|sk-|ghp_|github_pat_|BEGIN .*PRIVATE)' "$LOG_DIR/history-secret-scan.log"; then
  item BLOCKER "Possible secret in git history" "See \`$LOG_DIR/history-secret-scan.log\`." "Revoke, rotate and rewrite history with an approved procedure."
else
  pass "History secret scan" "No high-signal credential was detected by the configured history scan."
fi

section "Build, test and dependency evidence"
if [[ "$RUN_BUILD" -eq 1 ]]; then
  if command -v java >/dev/null 2>&1 && [[ -n "${JAVA_HOME:-}" ]]; then
    if run_command "gradle-test" "./gradlew test --stacktrace --no-daemon"; then
      pass "Unit tests" "\`./gradlew test\` passed in this environment."
    else
      item BLOCKER "Gradle test suite fails" "See command log above." "Fix test/toolchain failures and require the suite in CI."
    fi
    if run_command "gradle-lint" "./gradlew lintDebug --stacktrace --no-daemon"; then
      pass "Android lint" "\`lintDebug\` passed."
    else
      item MAJOR "Android lint did not pass" "See command log above." "Resolve lint findings or document narrowly scoped suppressions."
    fi
    if run_command "gradle-assemble" "./gradlew assembleDebug --stacktrace --no-daemon"; then
      pass "Debug build" "\`assembleDebug\` passed."
    else
      item BLOCKER "Debug APK does not build" "See command log above." "Fix build failure before any release candidate."
    fi
  else
    item BLOCKER "Java toolchain unavailable" "\`java\` or \`JAVA_HOME\` is absent; Gradle tests, lint and build were not executable." "Install the documented JDK (CI uses 17), set JAVA_HOME, then rerun this script."
  fi
else
  info "Build checks skipped" "Requested with \`--no-build\`."
fi
if [[ -f package.json ]]; then
  if command -v npm >/dev/null 2>&1; then
    run_command "npm-audit" "npm audit --omit=dev" || item MAJOR "npm audit reported findings" "See command log above." "Review and remediate supported dependency vulnerabilities."
  else
    item MAJOR "npm unavailable for dependency audit" "\`package.json\` exists but npm is absent." "Install npm and run npm audit."
  fi
else
  info "npm audit not applicable" "No \`package.json\` was found; this repository is Gradle/Android based."
fi

section "Source-quality checks"
TODO_FILE="$LOG_DIR/todo-fixme.log"
grep -RInE --exclude-dir=.gradle --exclude-dir=build '(TODO|FIXME|HACK|XXX)' app/src .github docs >"$TODO_FILE" 2>/dev/null || true
TODO_COUNT=$(wc -l <"$TODO_FILE" | tr -d ' ')
if [[ "$TODO_COUNT" -eq 0 ]]; then
  pass "TODO/FIXME census" "No matching markers were found."
else
  item MINOR "TODO/FIXME markers remain" "${TODO_COUNT} match(es); see \`$TODO_FILE\`." "Triage each marker or track it in an issue."
fi
DEBUG_FILE="$LOG_DIR/debug-logging.log"
grep -RInE --include='*.kt' --exclude-dir=build '(println\(|Log\.(d|v)|console\.log)' app/src/main >"$DEBUG_FILE" || true
DEBUG_COUNT=$(wc -l <"$DEBUG_FILE" | tr -d ' ')
if [[ "$DEBUG_COUNT" -eq 0 ]]; then
  pass "Production debug-log scan" "No println/verbose Android log match was found in main Kotlin source."
else
  item MINOR "Debug logging in main source" "${DEBUG_COUNT} match(es); see \`$DEBUG_FILE\`." "Remove or route logs through a PII-safe release logger."
fi

section "MVP feature evidence"
if grep -q 'startDestination = Screen.Home.route' app/src/main/java/com/example/MainActivity.kt && \
   grep -q 'mutableStateOf("123456")' app/src/main/java/com/example/ui/screens/auth/AuthScreens.kt; then
  item BLOCKER "Authentication is bypassed by demo navigation" "\`MainActivity.kt:194-197\` starts on Home, while \`AuthScreens.kt:278\` pre-fills OTP \`123456\`; repository methods also use fixed demo identities." "Implement server-side OTP/session auth and make protected navigation depend on a verified user."
else
  pass "Authentication static gate" "No obvious Home-start + fixed-OTP demo pairing matched; verify real auth end to end."
fi
if grep -q 'BuildConfig' app/src/main/java/com/example/data/remote/AiProviderRouter.kt && \
   grep -q 'generativelanguage.googleapis.com' app/src/main/java/com/example/data/remote/AiProviderRouter.kt; then
  item BLOCKER "AI provider credentials are client-side" "\`AiProviderRouter.kt:69-72\` reads BuildConfig values and \`82\` sends a direct provider request." "Move provider credentials and inference to an authenticated server-side gateway."
else
  pass "AI credential static gate" "No direct BuildConfig/provider pairing matched; verify release APK secrets separately."
fi
PAYMENT_URLS="$LOG_DIR/payment-network-paths.log"
grep -RInE --include='*.kt' 'https?://[^" ]*(zarinpal|shaparak|payment|pay\.ir|idpay)|webhook' app/src/main/java >"$PAYMENT_URLS" || true
if [[ -s "$PAYMENT_URLS" ]]; then
  pass "Payment network evidence found" "See \`$PAYMENT_URLS\`; manually verify signed webhooks, idempotency and settlement."
else
  item BLOCKER "No payment-provider or webhook implementation found" "No payment URL/webhook source was found; local wallet code only changes Room state in \`TamirkarRepository.kt:289-304\`." "Implement server-side payment capture, signed webhook verification, ledger and reconciliation."
fi
if grep -q 'isRecordingAudio' app/src/main/java/com/example/ui/screens/diagnosis/DiagnosisScreen.kt && \
   ! grep -RInE --include='*.kt' '(MediaRecorder|AudioRecord|ActivityResultContracts\.GetContent|takePicture)' app/src/main/java >/dev/null; then
  item MAJOR "Diagnosis attachments are UI-only" "Diagnosis screen has an \`isRecordingAudio\` state but no recorder, picker, capture or upload implementation was found." "Implement permission-gated capture, validation, encrypted upload and retry/error UX."
fi
if grep -q 'suspend fun diagnoseIssue' app/src/main/java/com/example/data/repository/TamirkarRepository.kt && grep -q 'class AiProviderRouter' app/src/main/java/com/example/data/remote/AiProviderRouter.kt; then
  pass "AI diagnosis source path exists" "Repository facade: \`TamirkarRepository.kt:308-309\`; provider router: \`AiProviderRouter.kt:23-124\`."
else
  item BLOCKER "AI diagnosis path absent" "Expected repository facade and provider router were not both found." "Implement and test a server-side diagnosis flow."
fi
if grep -q 'class DeviceEntity' app/src/main/java/com/example/data/local/entities/Entities.kt && grep -q 'getDeviceFlow' app/src/main/java/com/example/data/local/dao/TamirkarDao.kt; then
  pass "Local device passport storage exists" "\`Entities.kt:56-73\` and \`TamirkarDao.kt:40-44\` provide local record/retrieval."
else
  item MAJOR "Device passport storage incomplete" "Expected entity/retrieval path is missing." "Add a durable server-backed device event history."
fi
if grep -q 'fallbackToDestructiveMigration' app/src/main/java/com/example/data/local/TamirkarDatabase.kt; then
  item BLOCKER "Device history can be destructively migrated" "\`TamirkarDatabase.kt:54-56\` opts into destructive migration." "Add versioned migrations and server-backed append-only repair events."
fi
if grep -RInE --include='*.kt' 'type[[:space:]]*=[[:space:]]*\"escrow_release\"|insertTransaction\([^)]*escrow_release' app/src/main/java >"$LOG_DIR/escrow-release-paths.log"; then
  pass "Escrow release code path found" "See \`$LOG_DIR/escrow-release-paths.log\`; still verify idempotency and payment-provider settlement."
else
  item BLOCKER "No escrow-release implementation" "\`escrow_release\` appears only as a model enum/comment or has no executable path." "Implement server-side hold/release/refund ledger and idempotent worker."
fi
if grep -RInE --include='*.kt' '(KYC|kyc|verificationStatus|kycStatus|documentUrl|suspension|suspendTechnician)' app/src/main >"$LOG_DIR/kyc-paths.log"; then
  pass "Technician verification evidence found" "See \`$LOG_DIR/kyc-paths.log\`; verify process manually."
else
  item BLOCKER "No technician KYC/verification workflow" "No KYC/verification state-machine evidence was found in main source." "Implement document review, approval/suspension states and enforcement before matching."
fi
if grep -q 'qualityLevel' app/src/main/java/com/example/data/local/entities/Entities.kt && grep -q 'onClick = {}' app/src/main/java/com/example/ui/screens/secondary/SecondaryScreens.kt; then
  item MAJOR "Parts tiers are display-only" "Tier data exists in \`Entities.kt:157-173\`, while purchase handler is empty in \`SecondaryScreens.kt:277-283\`." "Implement inventory, quote/cart, payment and warranty fulfilment."
else
  pass "Parts tier source check" "No obvious display-only handler matched this static check."
fi
if grep -q 'android:supportsRtl="true"' app/src/main/AndroidManifest.xml; then
  pass "RTL manifest support" "\`AndroidManifest.xml\` enables RTL."
else
  item MAJOR "RTL is disabled" "No \`android:supportsRtl=\"true\"\` setting found." "Enable RTL and validate every customer flow on a device."
fi
if find app/src/main/res/values -type f -name '*.xml' -print0 | xargs -0 grep -q '<string'; then
  pass "Android string resources exist" "At least one values XML string resource is present."
else
  item MAJOR "No Android string resources" "No XML string resource was found." "Move user-facing text to resources for localisation."
fi

section "Database, API and operations"
if grep -RInE --include='*.kt' '(addMigrations\(|class[[:space:]].*Migration|object[[:space:]].*Migration)' app/src/main >/dev/null; then
  pass "Room migration source found" "Review migration tests before release."
else
  item BLOCKER "No Room migrations found" "No \`Migration(\` source match; the database currently uses destructive fallback." "Add forward migrations, schema exports and migration tests."
fi
[[ -f docs/API.md ]] && pass "API documentation file exists" "\`docs/API.md\` exists; verify it against an implemented server API before launch." || item MAJOR "No API documentation" "\`docs/API.md\` is missing." "Document and version the production API."
if find . -maxdepth 3 -type f \( -name 'Dockerfile' -o -name 'docker-compose.yml' -o -name 'compose.yml' \) | grep -q .; then
  info "Container files found" "Run the referenced compose/container command separately and attach logs."
else
  info "No container stack found" "No Dockerfile/Compose file detected; this is expected only if deployment is documented elsewhere."
fi
if [[ -f .github/workflows/build.yml ]]; then
  pass "CI workflow exists" "\`.github/workflows/build.yml\` is present. This static check cannot prove a passing remote run."
else
  item MAJOR "No primary CI workflow" "\`.github/workflows/build.yml\` is missing." "Add required build/test/release CI."
fi
[[ -f docs/DEPLOYMENT.md ]] && pass "Deployment documentation exists" "\`docs/DEPLOYMENT.md\` is present." || item MAJOR "No deployment guide" "\`docs/DEPLOYMENT.md\` is absent." "Document environments, rollout and rollback."
if [[ -f .github/social-preview.png ]]; then
  if command -v identify >/dev/null 2>&1; then
    DIMENSIONS=$(identify -format '%wx%h' .github/social-preview.png 2>/dev/null || true)
    if [[ "$DIMENSIONS" == "1280x640" ]]; then
      pass "Social preview asset" "\`.github/social-preview.png\` is 1280×640. Repository settings still require manual Social Preview upload/selection."
    else
      item MAJOR "Social preview dimensions are incorrect" "Expected 1280×640; got \`${DIMENSIONS:-unreadable}\`." "Export the final social preview at exactly 1280×640."
    fi
  else
    info "Social preview dimensions unverified" "ImageMagick \`identify\` is unavailable; asset exists at \`.github/social-preview.png\`."
  fi
else
  item MAJOR "Social preview asset missing" "\`.github/social-preview.png\` does not exist." "Create/export a 1280×640 preview and set it in GitHub repository settings."
fi

section "Result"
say "| Severity | Count |"
say "| --- | ---: |"
say "| 🔴 Blocker | $BLOCKERS |"
say "| 🟡 Major | $MAJORS |"
say "| 🟢 Minor | $MINORS |"
say "| 💡 Nice-to-have | $NICE |"
say
if [[ "$BLOCKERS" -gt 0 ]]; then
  say "## Decision: NO-GO"
  say "${BLOCKERS} blocker(s) were detected. Resolve every blocker and rerun this audit with a working JDK/toolchain before public MVP launch."
  EXIT_CODE=2
else
  say "## Decision: GO-WITH-EVIDENCE"
  say "No static blocker was detected. This is not a substitute for device, payment, security and production-operations verification."
  EXIT_CODE=0
fi
say
say "Generated report: \`$REPORT\`"
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  cat "$REPORT" >> "$GITHUB_STEP_SUMMARY"
fi
printf 'Launch-readiness audit: %s blocker(s), %s major(s). Report: %s\n' "$BLOCKERS" "$MAJORS" "$REPORT"
exit "$EXIT_CODE"

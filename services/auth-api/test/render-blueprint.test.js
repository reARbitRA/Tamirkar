import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Blueprint contract tests for render.yaml.
 *
 * These are deliberately structural rather than a full YAML parse: the repository ships no YAML
 * dependency (adding one would change package-lock.json and the `npm ci` surface for a single
 * assertion) and render.yaml is a hand-written file whose service blocks are line-delimited.
 *
 * Scope, stated honestly: this proves the DECLARATION is correct. It cannot prove Render accepts it
 * or that the scheduled job succeeds, because no Render API credential exists in this environment.
 *
 * Regression being pinned (F-OPS-001): the cron service inherited the auth-api image CMD
 * `sh -c "npm run migrate && npm start"`, so it booted a web server that never exits instead of the
 * escrow worker, and its environment pinned FEATURE_ESCROW_RELEASE to "false", so the route the
 * worker calls would have answered 503 anyway.
 */
const blueprint = readFileSync(new URL('../../../render.yaml', import.meta.url), 'utf8');

/** Returns the text of the service block whose `- type:` header matches. */
function serviceBlock(type, name) {
  const lines = blueprint.split('\n');
  const start = lines.findIndex((l) => l.includes(`- type: ${type}`));
  assert.notEqual(start, -1, `render.yaml must declare a ${type} service`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s{2}- /.test(lines[i])) { end = i; break; }
  }
  const block = lines.slice(start, end).join('\n');
  assert.ok(block.includes(`name: ${name}`), `the ${type} block must be the one named ${name}`);
  return block;
}

test('the escrow cron runs the worker, not the web server', () => {
  const cron = serviceBlock('cron', 'oosta-escrow-release');
  assert.match(
    cron,
    /dockerCommand:\s*node src\/escrow-worker\.js/,
    'without dockerCommand the image CMD boots a web server instead of the worker'
  );
  assert.doesNotMatch(cron, /npm start/, 'the cron must not start the HTTP server');
  assert.doesNotMatch(cron, /npm run migrate/, 'the cron must not migrate; the web service owns migration');
});

test('the escrow cron carries only the variables the worker reads', () => {
  const cron = serviceBlock('cron', 'oosta-escrow-release');
  const keys = [...cron.matchAll(/^\s+- key: ([A-Z_0-9]+)/gm)].map((m) => m[1]);
  assert.deepEqual(keys.sort(), ['ESCROW_WORKER_TOKEN', 'NODE_ENV', 'PLATFORM_API_BASE_URL']);
  assert.doesNotMatch(
    cron,
    /generateValue:\s*true/,
    'a generated secret differs per service, so a cron generated token could never match the web service'
  );
});

test('escrow release is never enabled by the blueprint itself', () => {
  assert.doesNotMatch(
    blueprint,
    /FEATURE_ESCROW_RELEASE:\s*\n\s*value:\s*"true"/,
    'every money capability must stay fail-closed until separately approved'
  );
  const web = serviceBlock('web', 'oosta-auth-api-staging');
  assert.match(
    web,
    /- key: FEATURE_ESCROW_RELEASE\s*\n\s*sync: false/,
    'the operator must be able to enable escrow release without editing the blueprint'
  );
});

test('every feature flag is still declared explicitly on the web service', () => {
  const web = serviceBlock('web', 'oosta-auth-api-staging');
  for (const flag of ['FEATURE_AI_DIAGNOSIS', 'FEATURE_NEW_BOOKINGS', 'FEATURE_PAYMENTS',
                      'FEATURE_TECHNICIAN_MATCHING', 'FEATURE_ESCROW_RELEASE']) {
    assert.match(web, new RegExp(`- key: ${flag}\\b`), `${flag} must be declared`);
  }
  assert.doesNotMatch(web, /OTP_DEV_LOG_CODE:\s*\n\s*value:\s*"true"/, 'plaintext OTP logging must never be enabled in a deployed environment');
});

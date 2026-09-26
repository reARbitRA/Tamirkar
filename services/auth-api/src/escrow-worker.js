// Invoke this process from a scheduler with a short-lived operator JWT in ESCROW_WORKER_TOKEN.
// The API remains the single idempotent state-transition boundary.
const baseUrl = String(process.env.PLATFORM_API_BASE_URL ?? '').replace(/\/$/, '');
const token = String(process.env.ESCROW_WORKER_TOKEN ?? '');
if (!baseUrl || !token) throw new Error('PLATFORM_API_BASE_URL and ESCROW_WORKER_TOKEN are required');

const response = await fetch(`${baseUrl}/v1/admin/escrows/release-due`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(30_000)
});
if (!response.ok) throw new Error(`Escrow worker failed with HTTP ${response.status}`);
console.log(await response.text());

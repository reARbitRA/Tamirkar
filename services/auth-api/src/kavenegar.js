/**
 * Sends a one-time code through Kavenegar Verify Lookup.
 * The secret stays in this service's environment; Android never receives it.
 */
export async function sendKavenegarOtp({ apiKey, template, receptor, token }) {
  const url = `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/verify/lookup.json`;
  const form = new URLSearchParams({ receptor, token, template });
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(10_000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.return?.status !== 200) {
    const message = payload?.return?.message || `Kavenegar HTTP ${response.status}`;
    throw new Error(message);
  }
  return String(payload.entries?.[0]?.messageid ?? 'accepted');
}

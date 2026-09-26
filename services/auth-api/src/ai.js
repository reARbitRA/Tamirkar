import crypto from 'node:crypto';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGES = 2;
const PHONE_PATTERN = /(?:\+?98|0)?9\d{9}/g;
const NATIONAL_ID_PATTERN = /\b\d{10}\b/g;

export class AiUnavailableError extends Error {}

/** Remove common direct identifiers before a diagnostic prompt leaves Oosta's boundary. */
export function redactPromptText(value) {
  const latinDigits = String(value ?? '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  return latinDigits
    .replace(PHONE_PATTERN, '[شماره حذف شد]')
    .replace(NATIONAL_ID_PATTERN, '[شناسه حذف شد]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2_000);
}

function safeImages(images) {
  if (!Array.isArray(images)) return [];
  return images.slice(0, MAX_IMAGES).filter((image) => {
    if (typeof image !== 'string') return false;
    // A base64 byte count is at most 3/4 of its character count. Reject rather than truncate images.
    return image.length > 0 && image.length <= Math.ceil(MAX_IMAGE_BYTES * 4 / 3);
  });
}

function diagnosisPrompt({ category, symptom }) {
  return `You are Oosta's repair-triage assistant. Return only JSON and never claim certainty, quote a binding price, authorize payment, escrow release, refunds, or safety-critical repair.\n
Category: ${redactPromptText(category)}\nCustomer symptom: ${redactPromptText(symptom)}\n
Required JSON schema:\n{\n  "probable_causes": ["Persian text"],\n  "diy_possible": false,\n  "diy_guide_persian": "Persian text",\n  "estimated_price_min": 0,\n  "estimated_price_max": 0,\n  "required_parts": ["Persian text"],\n  "safety_warnings": ["Persian text"],\n  "confidence_score": 0,\n  "summary_fa": "Persian text"\n}\nUse confidence below 70 whenever evidence is insufficient. Every answer must state that an in-person quote is required.`;
}

function extractText(payload) {
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text ?? '')
    .join('\n')
    .trim();
  if (!text) throw new AiUnavailableError('AI provider returned no diagnostic text');
  return text;
}

/**
 * Calls Gemini from the server only. API keys never cross this module's process boundary.
 * A request id is returned to correlate safely with server logs without storing prompt content.
 */
export async function generateDiagnosis({ config, category, symptom, images = [] }) {
  if (!config.aiEnabled || !config.geminiApiKey) {
    throw new AiUnavailableError('AI diagnosis is currently unavailable');
  }
  const parts = [{ text: diagnosisPrompt({ category, symptom }) }];
  safeImages(images).forEach((image) => {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: image } });
  });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
      }),
      signal: AbortSignal.timeout(20_000)
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AiUnavailableError(`AI provider request failed with HTTP ${response.status}`);
  }
  return { text: extractText(payload), requestId: crypto.randomUUID() };
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function latinDigits(value) {
  return String(value ?? '')
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC_DIGITS.indexOf(digit)));
}

/** Normalise Iranian mobile numbers to E.164 (+989xxxxxxxxx). */
export function normalizeIranMobile(value) {
  const compact = latinDigits(value).trim().replace(/[\s()-]/g, '');
  if (/^09\d{9}$/.test(compact)) return `+98${compact.slice(1)}`;
  if (/^\+989\d{9}$/.test(compact)) return compact;
  if (/^00989\d{9}$/.test(compact)) return `+${compact.slice(2)}`;
  if (/^989\d{9}$/.test(compact)) return `+${compact}`;
  return null;
}

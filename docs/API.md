# API Specification & Endpoints — Tamirkar (تعمیرکار)

## 📡 1. Gemini AI REST Engine
- **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`
- **Models**:
  - `gemini-3.5-flash`: Fast diagnosis, support chat, matching scores, reminder generation.
  - `gemini-3.1-pro-preview`: Complex dispute arbitration, fine visual damage analysis, quality control photo audit.
- **Request Format**:
```json
{
  "contents": [
    {
      "parts": [
        { "text": "System prompt and Iranian appliance repair instructions..." },
        { "inlineData": { "mimeType": "image/jpeg", "data": "base64..." } }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.2,
    "responseFormat": { "text": { "mimeType": "application/json" } }
  }
}
```

---

## 💳 2. Payment Gateway (ZarinPal Integration)
- **Currency Conversion**: Database stores Tomans (تومان); ZarinPal takes Rials ($1 \text{ Toman} = 10 \text{ Rials}$).
- **Request Endpoint**: `https://api.zarinpal.com/pg/v4/payment/request.json`
- **Verification Endpoint**: `https://api.zarinpal.com/pg/v4/payment/verify.json`

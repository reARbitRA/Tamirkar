# گزارش راستی‌آزمایی معماری چند Provider هوش مصنوعی

تاریخ بررسی: ۲۰۲۶-۰۸-۲۶

## نتیجه

معماری چند Provider از نظر API عملی است و در کد اپلیکیشن یک Router واقعی اضافه شده است. `GeminiAiEngine` دیگر مستقیماً به Gemini برای درخواست‌های فعال متصل نمی‌شود؛ درخواست‌ها از `AiProviderRouter` عبور می‌کنند.

Providerهای پشتیبانی‌شده:

- Google AI Studio / Gemini Native API
- Groq / OpenAI-compatible Chat API
- Cerebras / OpenAI-compatible Chat API
- OpenRouter / OpenAI-compatible Chat API
- Hugging Face Inference Providers / OpenAI-compatible Chat API

## راستی‌آزمایی مستندات رسمی

| Provider | Endpoint واقعی | قابلیت تأییدشده |
|---|---|---|
| Groq | `https://api.groq.com/openai/v1/chat/completions` | Chat، مدل‌ها، ورودی تصویر در مدل‌های پشتیبان |
| Cerebras | `https://api.cerebras.ai/v1/chat/completions` | Chat و مدل‌های عمومی متنی |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | Chat، مدل `openrouter/free`، fallback/routing |
| Hugging Face | `https://router.huggingface.co/v1/chat/completions` | Chat و VLM در مدل‌های پشتیبان |
| Google | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | متن، تصویر، structured JSON |

منابع رسمی بررسی‌شده:

- https://console.groq.com/docs/openai
- https://console.groq.com/docs/api-reference
- https://inference-docs.cerebras.ai/models/overview
- https://ai.google.dev/gemini-api/docs/openai
- https://openrouter.ai/docs/guides/routing/routers/free-router
- https://openrouter.ai/docs/api_reference/limits
- https://huggingface.co/docs/inference-providers/en/tasks/chat-completion

## چیزی که تست شده است

### تست‌های استاتیک/واحد اضافه‌شده

فایل تست:

`app/src/test/java/com/example/AiProviderRouterTest.kt`

این تست‌ها بررسی می‌کنند:

1. وظایف متنی ابتدا Groq و سپس Cerebras/OpenRouter/Hugging Face را در صف قرار می‌دهند.
2. وظایف Vision فقط از candidateهای دارای قابلیت Vision استفاده می‌کنند.
3. وظایف ذاتاً تصویری حتی بدون تصویر نیز در صف Vision قرار می‌گیرند.
4. Router برای هر Provider مسیر OpenAI-compatible درست یا مسیر Native Gemini را انتخاب می‌کند.
5. کلید خالی باعث ارسال درخواست نمی‌شود.
6. خطای Provider به Provider بعدی منتقل می‌شود.

## تست زنده

تست End-to-End در این checkout قابل اجرای مسئولانه نبود، چون هیچ کلید واقعی Provider در محیط وجود ندارد. فایل `.env.example` فقط placeholder دارد و تست با کلید جعلی نتیجه معتبر تولید نمی‌کند. ادعای موفقیت Live API بدون کلید واقعی، قابل قبول نیست.

برای اجرای تست زنده باید کلیدها فقط در Environment/Secret Manager قرار بگیرند:

```text
GEMINI_API_KEY=...
GROQ_API_KEY=...
CEREBRAS_API_KEY=...
OPENROUTER_API_KEY=...
HF_TOKEN=...
```

کلید واقعی نباید داخل APK منتشر شود. پیاده‌سازی فعلی برای MVP مستقیم از BuildConfig می‌خواند، اما برای انتشار Production باید همین Router به Backend منتقل شود.

## محدودیت‌های عمدی

- فهرست مدل‌ها Hard-code نشده و با overrideهای `.env` قابل تغییر است.
- «رایگان» به‌عنوان وضعیت دائمی فرض نشده است؛ سهمیه و مدل‌های رایگان Providerها تغییر می‌کنند.
- OpenRouter Free و مدل‌های رایگان به‌عنوان fallback استفاده می‌شوند، نه منبع قطعی SLA.
- برای قیمت تعمیر، AI مجاز به تولید قیمت نیست. قیمت باید از سرویس فروشگاه‌ها و Pricing Engine بیاید.
- Providerهای متنی برای درخواست تصویری استفاده نمی‌شوند.
- پاسخ نامعتبر، خطای HTTP، timeout و rate limit باعث fallback می‌شود.

## وضعیت Build

اجرای تست Gradle در این محیط انجام نشد، چون Repository فاقد `gradlew` و محیط فاقد دستور `gradle` است:

```text
/bin/bash: ./gradlew: No such file or directory
```

بنابراین نتیجه فعلی صادقانه این است:

- بررسی API و طراحی مسیرها: انجام شد.
- تست‌های واحد: نوشته شد، اما اجرای آن به Gradle Wrapper نیاز دارد.
- تست زنده Providerها: به‌دلیل نبود کلید واقعی اجرا نشد.
- تأیید Production: منوط به انتقال Gateway به Backend، افزودن secrets واقعی و اجرای ماتریس زنده Providerهاست.

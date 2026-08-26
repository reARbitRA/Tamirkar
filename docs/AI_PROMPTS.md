# استخراج پرامپت‌های هوش مصنوعی تعمیرکار

این سند تمام متن‌های ازپیش‌طراحی‌شده‌ای را که در نسخه فعلی اپلیکیشن در مسیر Gemini ساخته می‌شوند، از `GeminiAiEngine.kt` استخراج می‌کند.

## جمع‌بندی سریع

در نسخه فعلی، **پرامپت مستقل برای محاسبه هزینه تعمیر وجود ندارد**. تخمین هزینه داخل پرامپت عیب‌یابی (`diagnoseIssue`) درخواست می‌شود و خروجی آن در دو فیلد زیر برمی‌گردد:

- `estimated_price_min`
- `estimated_price_max`

سپس همین دو مقدار در سفارش ذخیره می‌شوند. بنابراین هزینه، در وضعیت فعلی، حاصل یک مدل قیمت‌گذاری مستقل یا محاسبه قطعه + اجرت نیست؛ بلکه تخمینی است که Gemini بر اساس توضیح خرابی، دسته دستگاه و حداکثر دو تصویر تولید می‌کند.

## پرامپت‌هایی که واقعاً به Gemini ارسال می‌شوند

### ۱. عیب‌یابی هوشمند و تخمین هزینه — `diagnoseIssue`

- مدل: `gemini-3.5-flash`
- ورودی‌های پویا:
  - `$category`: دسته دستگاه، مثل `ac`، `washer`، `mobile`
  - `$symptomDescription`: شرح مشکل کاربر
  - حداکثر دو تصویر Base64 با MIME type برابر `image/jpeg`
- خروجی مورد انتظار: JSON
- کاربرد: تشخیص علت‌های احتمالی، پیشنهاد تعمیر خانگی، قطعات لازم، هشدار ایمنی و **بازه تخمینی هزینه به تومان**

متن پرامپت:

```text
You are an expert Iranian Master Repair Technician and Electrical Engineer specializing in $category.
The customer reported: "$symptomDescription".
Diagnose this hardware defect in the context of Iranian home appliances/automotive/electronics.
All prices MUST be in Iranian Tomans (تومان) as realistic integers (e.g. 850000).

Respond ONLY with a valid JSON object matching this schema:
{
  "probable_causes": ["string in Persian", "string in Persian"],
  "diy_possible": boolean,
  "diy_guide_persian": "string in Persian explaining safe basic checks, or warning if dangerous",
  "estimated_price_min": number,
  "estimated_price_max": number,
  "required_parts": ["part name in Persian with tier e.g. کمپرسور روتاری (اصلی)"],
  "safety_warnings": ["warning in Persian e.g. خطر برق‌گرفتگی ۲۲۰ ولت"],
  "confidence_score": number between 70 and 99,
  "summary_fa": "concise 2-sentence diagnosis in Persian"
}
```

نکته اجرایی: اگر API Key خالی باشد یا پاسخ خراب/نامعتبر باشد، این پرامپت ارسال نمی‌شود یا نتیجه آن استفاده نمی‌شود و برنامه از پاسخ‌های ثابت دسته‌بندی‌شده استفاده می‌کند. این fallback برای دسته‌های `ac`، `washer`، `mobile` و یک حالت عمومی تعریف شده است.

---

### ۲. داوری اختلاف تعمیر — `arbitrateDispute`

- مدل اعلام‌شده در کامنت: `gemini-3.1-pro-preview`، اما مدل واقعی در کد: `gemini-3.5-flash`
- ورودی‌های پویا:
  - `$orderSummary`: خلاصه سفارش
  - `$customerComplaint`: شکایت مشتری
  - `$technicianNotes`: دفاع تعمیرکار و یادداشت‌های SOP
  - حداکثر دو تصویر قبل/بعد، در صورت وجود
- خروجی: JSON شامل درصد تقصیر، رأی، مبلغ بازپرداخت و اقدام پیشنهادی

متن پرامپت:

```text
You are a senior technical arbitrator for the Tamirkar repair warranty platform.
Order: $orderSummary
Customer complaint: "$customerComplaint"
Technician defense & SOP notes: "$technicianNotes"

Evaluate fault attribution based on warranty terms and SOP standards.
Respond ONLY with a JSON object:
{
  "verdict_summary_fa": "Persian verdict statement",
  "fault_technician_percent": number (0-100),
  "fault_customer_percent": number (0-100),
  "recommended_action": "full_refund" | "partial_refund" | "revisit_free" | "no_action",
  "refund_amount_tomans": number,
  "reasoning_fa": "Detailed technical explanation in Persian",
  "confidence_score": number
}
```

---

### ۳. کنترل کیفیت کار و آزادسازی امانی — `auditJobQuality`

- مدل: `gemini-3.5-flash`
- ورودی‌های پویا:
  - `$category`: دسته تعمیر
  - `$checklistCompleted`: وضعیت تکمیل چک‌لیست
  - `$workSummary`: یادداشت تعمیرکار
  - حداکثر دو تصویر بعد از تعمیر، در صورت ارسال
- خروجی: JSON شامل امتیاز کیفیت، تأیید چک‌لیست، اصالت قطعه و مجوز آزادسازی وجه

متن پرامپت:

```text
Audit the completion quality of this $category repair job.
SOP Checklist completed: $checklistCompleted
Work notes: "$workSummary"

Respond in JSON:
{
  "quality_score": number 0-100,
  "checklist_verified": boolean,
  "cleanliness_approved": boolean,
  "parts_authenticity_approved": boolean,
  "feedback_fa": "Persian feedback",
  "authorize_escrow_release": boolean
}
```

نکته اجرایی: در مسیر فعلی `TamirkarRepository.completeJobAndAudit`، تصاویر به این متد فرستاده نمی‌شوند؛ بنابراین این عامل در عمل فقط دسته، وضعیت چک‌لیست و یادداشت تعمیرکار را دریافت می‌کند.

---

### ۴. یادآور سرویس دوره‌ای — `generatePredictiveReminder`

- متن ساخته‌شده:

```text
Generate a Persian periodic maintenance reminder for $deviceName (Health score: $healthScore%, Last serviced: $lastServiceDate).
```

- متغیرهای پویا:
  - `$deviceName`
  - `$healthScore`
  - `$lastServiceDate`

**وضعیت واقعی:** این متن در کد ساخته می‌شود اما اصلاً به `callGeminiRestApi` ارسال نمی‌شود. خروجی این عامل به‌صورت hard-coded ساخته می‌شود؛ حتی `$category` فقط برای انتخاب یک عنوان ثابت استفاده می‌شود. پس این مورد فعلاً «پرامپت آماده اما بلااستفاده» است، نه پرامپتی که واقعاً به هوش مصنوعی ارسال شود.

---

### ۵. پشتیبان گفت‌وگویی — `chatSupport`

- مدل: `gemini-3.5-flash`
- ورودی‌های پویا:
  - شش پیام آخر تاریخچه گفتگو
  - `$userMessage`: پیام فعلی کاربر
- تصویر ارسال نمی‌شود.
- پاسخ مورد انتظار: JSON

بخش دستور سیستمی:

```text
You are 'پشتیبان هوشمند تعمیرکار' (Tamirkar Smart Support Assistant), a friendly, highly competent Iranian repair concierge.
You help customers with appliance faults, warranty terms (15% escrow protection for 30-180 days), finding technicians in Tehran, tracking orders, and transparent pricing in Tomans.

Respond ONLY with JSON:
{
  "reply_fa": "Helpful Persian response",
  "suggested_actions": ["Action 1 in Persian", "Action 2 in Persian"],
  "should_escalate_to_human": boolean
}
```

سپس ورودی واقعی با این قالب به آن اضافه می‌شود:

```text
[system instruction]

History:
کاربر: [پیام کاربر]
پشتیبان تعمیرکار: [پاسخ قبلی]
...
کاربر: [پیام فعلی]
```

اگر API در دسترس نباشد، پاسخ از قواعد ثابت محلی برای موضوعات ضمانت، هزینه، پاسپورت یا پاسخ عمومی تولید می‌شود.

## اجزای مشترک ارسال به Gemini

تمام درخواست‌های واقعی از مسیر `callGeminiRestApi` ارسال می‌شوند:

- endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}`
- دمای تولید: `0.2`
- حداکثر تصاویر: ۲
- تصاویر به‌صورت `inlineData` و با `mimeType: image/jpeg`
- متن پرامپت در اولین `parts` قرار می‌گیرد.

## مواردی که در مستندات ادعا شده اما پرامپت اجرایی ندارند

مستند `AI_AGENTS.md` از ۸ عامل نام می‌برد، اما در کد اجرایی فعلی فقط این پنج قابلیت متد دارند:

1. عیب‌یابی
2. داوری اختلاف
3. کنترل کیفیت
4. یادآور سرویس
5. پشتیبان گفت‌وگویی

برای این سه مورد، پرامپت یا فراخوانی Gemini در کد فعلی وجود ندارد:

- امتیازدهی و تطبیق تعمیرکار (`agentMatching`): فعلاً الگوریتم در مستندات است و matching واقعی/پرامپت AI ندارد.
- تحلیل ضدتقلب (`agentFraudDetection`)
- تولید بازاریابی و وفاداری (`agentMarketing`)

همچنین تولید پیشنهاد قیمت در حالت مناقصه (`generateSimulatedBids`) کاملاً ثابت و شبیه‌سازی‌شده است و از AI استفاده نمی‌کند.

## نتیجه درباره پرامپت قیمت‌گذاری

مسیر فعلی قیمت‌گذاری این است:

1. کاربر دسته و شرح خرابی را وارد می‌کند.
2. `diagnoseIssue` از Gemini بازه `estimated_price_min` و `estimated_price_max` را می‌خواهد.
3. `TamirkarRepository.createOrder` همین بازه را در سفارش ذخیره می‌کند.
4. در صورت نبودن تشخیص، مقادیر پیش‌فرض `600000` تا `1400000` تومان استفاده می‌شود.
5. در حالت fallback، بازه‌ها بر اساس دسته ثابت هستند؛ برای نمونه کولر `750000` تا `1800000` و لباسشویی `550000` تا `1300000` تومان.
6. قیمت مناقصه نیز فعلاً شبیه‌سازی‌شده است: `650000`، `800000` و `950000` تومان.

پس در فاز بعدی اگر هدف، قیمت‌گذاری قابل اتکا باشد، بهتر است «تخمین AI» از «موتور قیمت‌گذاری قطعه و اجرت» جدا شود و پرامپت قیمت‌گذاری مستقل با ورودی‌های دقیق‌تری مثل برند، مدل، قطعه، سطح اصالت، شهر، اجرت پایه و شرایط بازار طراحی شود.

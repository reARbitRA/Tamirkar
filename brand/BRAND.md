# اوستا / Oosta — Brand Bible

> **اول تشخیص، بعد هزینه.**  
> *Diagnose first. Pay fair. Repair, don't replace.*

This is the canonical brand system for Oosta. The earlier working title **Tamirkar** is retired in public-facing copy; retain legacy internal identifiers only until a deliberate data migration is planned.

## 1. اسطوره — The Backstory

### Logline

In a Tehran where everything is expensive and nothing is made to last, the last apprentice of **Kaveh the Blacksmith** runs a workshop bigger on the inside—and has started teaching machines to listen to machines.

### Why this brand has a soul

Persian mythology gives Oosta its founder: **کاوهٔ آهنگر**. When Kaveh raised his leather apron on a spear, it became **درفش کاویانی**. A worker's apron became the banner of a people. Oosta recasts that object as an everyday promise: repair is dignity, not deprivation.

The modern Zahhāk is not a visible villain. It is the disposability spell: **«صرف نمی‌کنه، بنداز دور، نو بخر.»** Oosta answers with **«دور نینداز، درستش کن.»**

### The protagonist — استاد کاوه

**استاد کاوه** is in his late sixties. Silver hair has clearly lost a war with a bench grinder and a ceiling fan. A loupe is strapped over one eye; reading glasses are on his forehead; another pair hangs at his chest. His cracked oxblood leather apron has brass rivets, a tea-stained pocket, and a burn scar on the left thumb.

He does not talk to appliances cutely; he listens diagnostically. A brass stethoscope on a compressor is a doctor's instrument. His wall rule is:

> **اول تشخیص، بعد هزینه.**

### The workshop — کارگاه

Under a bridge in the iron bazaar is a narrow door to a vertical salvage cathedral: boiler to samovar, samovar to washing-machine flywheel, flywheel to Paykan alternator, radiator to refrigerator, compressor hum to rotary-phone microphone, microphone to an old PC, and the old PC to a dot-matrix paper trail.

A wheelless taxi is the desk. Fifty old phones are a sensor farm. A cat sleeps inside a washing-machine drum. The queues are handwritten because paper is a perfectly valid repair of a broken digital queue system.

### The four relics

| Relic | Product truth |
| --- | --- |
| **گوشِ کاوه** | AI acoustic diagnosis: a listening instrument, never a robot oracle. |
| **شناسنامه** | A permanent, stamped device history that makes a repair traceable. |
| **پولِ امانت** | A visible ۱۵٪ held amount for the warranty window. |
| **کشوی سه‌طبقه** | Transparent parts choices: اصلی · درجه‌یک · اقتصادی. |
| **مُهر صنف** | A unique technician-verification punch, paired with before/after evidence. |

### Theme

> **دور نینداز، درستش کن.**  
> Repair is not poverty. Repair is sovereignty.

---

## 2. Brand identity system

### The mark — پیش‌بندِ کاوه / Apron Shield

The primary mark is a cropped blacksmith's leather apron. It already reads as a shield (trust and escrow) and recalls the **درفش کاویانی**—without using a wrench, gear, robot, or generic repair cliché.

- Worn oxblood/tobacco saddle leather; honest grain and one crack
- Three brass rivets, echoing the three dots of **ت**
- A single emerald-teal saddle stitch rising through the center
- One small hex nut at the bottom as a weight
- Warm tungsten from upper left on a graphite/night-navy field

At 16px, the mark must still resolve as **dark shield + three brass dots + teal stitch**.

**Secondary mark:** the Ostad Kaveh bust. Use it for character moments, empty states, loading, stickers, and editorial surfaces—not where a durable app icon is needed.

### Palette

| Role | Token | Hex |
| --- | --- | --- |
| Base | شب / Night navy | `#080D16` |
| Surface | Graphite | `#141A22` |
| Primary | Emerald teal | `#10B39A` |
| Accent | Cyan data | `#22D3EE` |
| Signal | Electric green | `#4ADE80` |
| Trust | Brass | `#D8A24A` |
| Material | Oxblood leather | `#6B3A2A` |
| Paper | Bone | `#EDE6D6` |

**Lighting rule:** glow belongs only to diagnostic data lines and the escrow box. Physical objects are lit with tungsten, never neon.

### Typography

| Use | Preferred face | Fallback |
| --- | --- | --- |
| Latin display | Archivo Expanded Black / Space Grotesk Bold | sans-serif, 900 |
| Persian display | Morabba Bold / Estedad ExtraBold | Vazirmatn 800 |
| Persian body | Vazirmatn 400/600 | DejaVu Sans |
| Code and labels | JetBrains Mono | monospace |

Use Persian digits in Persian lines: **۱۵٪**, never `15%`.

---

## 3. Copy deck

```text
BRAND_FA        = اوستا
BRAND_EN        = OOSTA

TAGLINE_MAIN    = اول تشخیص، بعد هزینه.
TAGLINE_SUB     = تشخیص درست و قیمت منصفانه، برای روزهایی که همه‌چیز گران است.

TAGLINE_ALT_1   = دور نینداز، درستش کن.
TAGLINE_ALT_2   = یک ریال هم بیشتر از آنچه لازم است، نده.
TAGLINE_ALT_3   = بدان چه خراب است، بدان چقدر می‌ارزد.
TAGLINE_ALT_4   = تعمیرِ منصفانه، حقِ همه است.

B_ESCROW        = ضمانت امانی ۱۵٪
B_AI            = تشخیص هوشمند از روی صدا
B_PASSPORT      = شناسنامهٔ دیجیتال دستگاه
B_TECH          = استادکارِ تأییدشده
B_PARTS         = بازار شفاف قطعات
PARTS_TIERS     = اصلی · درجه‌یک · اقتصادی

EN_SUB          = Diagnose first. Pay fair. Repair, don't replace.
EN_STACK        = AI diagnosis · Device passport · 15% escrow · Verified technicians · Open source
```

## Asset index

- [`icon-1024.png`](./icon-1024.png) through [`icon-16.png`](./icon-16.png): primary mark exports
- [`icon-maskable.png`](./icon-maskable.png): PWA maskable icon with a 20% safe area
- [`icon-mono.svg`](./icon-mono.svg): single-colour fallback
- [`poster-ostad-kaveh.png`](./poster-ostad-kaveh.png): finished 2:3 campaign poster
- [`social-preview.png`](./social-preview.png): 1280×640 social composition
- [`prompts/`](./prompts/): source prompts and production notes

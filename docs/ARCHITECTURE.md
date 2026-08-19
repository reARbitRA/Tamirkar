# Architecture — Tamirkar (تعمیرکار)

## 🏗️ Architectural Overview
Tamirkar is engineered following **Clean Architecture** and **Modern Android Architecture (MVVM)** with unidirectional data flow (UDF) powered by Kotlin Coroutines and StateFlow.

```
┌─────────────────────────────────────────────────────────────┐
│                       UI Layer (Compose)                    │
│  Activities, Navigation Compose, Screens, Composables, Theme│
└──────────────────────────────┬──────────────────────────────┘
                               │ StateFlow / Events
┌──────────────────────────────▼──────────────────────────────┐
│                    ViewModel Layer                          │
│  StateHolders, UiState sealed classes, coroutineScope       │
└──────────────────────────────┬──────────────────────────────┘
                               │ Flow / Suspend functions
┌──────────────────────────────▼──────────────────────────────┐
│                    Domain / Repository                      │
│  DeviceRepository, OrderRepository, WarrantyRepository,     │
│  PartsRepository, WalletRepository, GeminiAiEngine          │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               │                               │
┌──────────────▼──────────────┐ ┌──────────────▼──────────────┐
│        Local Persistence     │ │        Remote & AI Engine   │
│  Room Database, SQLite, DAOs│ │  Gemini 3.5 Flash / 3.1 Pro │
│  Preloaded Tehran Seed Data │ │  REST API / Retrofit Client │
└─────────────────────────────┘ └─────────────────────────────┘
```

## 🔐 Key Architectural Patterns
1. **Repository Pattern**: Centralizes data fetching and combines local Room caching with remote intelligence.
2. **Offline-First Resilience**: All core data (digital passports, orders, parts catalog, checklists, transactions) are stored in Room with instant UI updates.
3. **Multimodal AI Integration**: Autonomous Gemini engine handles diagnostic photo/audio ingestion, technician radar scoring, dispute resolution, and SOP photo verification.
4. **Persian / RTL Native Support**: Clean layout mirror, Iranian currency formatters (Tomans), Jalali calendar integration helpers, and high-legibility Persian typography.

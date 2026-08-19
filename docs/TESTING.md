# Testing Strategy — Tamirkar (تعمیرکار)

## 🧪 Verification Architecture
1. **Robolectric JVM Tests**: Validates business logic, escrow splits, and database CRUD.
2. **Roborazzi Screenshot Tests**: Visual regression testing for RTL layouts, Persian font rendering, and Material 3 components.
3. **AI Agent Mock & Fallback Tests**: Verifies graceful handling if offline or during network latency.

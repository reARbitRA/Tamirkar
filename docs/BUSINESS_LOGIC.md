# Business Logic & Financial Mechanics — Tamirkar (تعمیرکار)

## 💰 1. The 15% Warranty Escrow Model (ضمانت اجرایی)
To eliminate poor workmanship and lack of post-repair accountability in the Iranian market, Tamirkar implements an automated escrow vault:

1. **Customer Checkout**: Customer pays the agreed order total $P_{\text{total}}$ in Tomans.
2. **Immediate Split upon AI QC Approval**:
   - **Spare Parts**: $P_{\text{parts}}$ reimbursed to technician/seller directly.
   - **Platform Commission**: $C = P_{\text{labor}} \times \text{CommissionRate}$ (12% to 20%).
   - **Escrow Hold**: $E = P_{\text{total}} \times 15\%$ held in escrow until warranty duration expires.
   - **Immediate Labor Payout**: $P_{\text{labor\_immediate}} = P_{\text{labor}} - C - E$.
3. **Warranty Expiry Release**: When the warranty window (30-180 days) elapses with no open dispute, the escrow amount $E$ is automatically deposited into the technician's spendable wallet.

---

## 🎖️ 2. Technician Gamification & Commission Hierarchy
| Level (سطح) | Required XP | Platform Commission | Benefits |
|---|---|---|---|
| **Apprentice (کارآموز)** | 0 - 999 XP | **20.0%** | Standard job routing |
| **Specialist (متخصص)** | 1,000 - 4,999 XP | **16.0%** | Priority matching, verified badge |
| **Master (استادکار)** | 5,000 - 9,999 XP | **14.0%** | Golden badge, high-value appliance jobs |
| **Superstar (سوپراستار)** | 10,000+ XP | **12.0%** | Lowest commission, featured profile, VIP support |

- **XP Gain**: +100 XP per completed job, +50 bonus XP for 5-star review, +30 bonus XP for zero-dispute warranty period.

---

## 📱 3. Digital Passport Health Score Algorithm
Each device starts with a **Health Score** of 100%.
- Health decreases by $-10\%$ per major component failure or $+5\%$ upon verified genuine OEM part replacement.
- Degrades by $-1\%$ for every 30 days without scheduled periodic maintenance.
- Color codes:
  - `90% - 100%`: 🟢 **عالی (Excellent)**
  - `70% - 89%`: 🟡 **مطلوب (Good / Due Soon)**
  - `50% - 69%`: 🟠 **نیازمند بررسی (Needs Inspection)**
  - `< 50%`: 🔴 **بحرانی (Critical Risk)**

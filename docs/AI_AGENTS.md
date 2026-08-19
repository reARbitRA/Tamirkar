# AI Agents Architecture — Tamirkar (تعمیرکار)

## 🤖 Overview of the 8 Autonomous Gemini Agents

Tamirkar integrates 8 specialized Gemini AI agents powered by `gemini-3.5-flash` for high-throughput operational tasks and `gemini-3.1-pro-preview` for high-precision diagnostic and dispute arbitration tasks.

---

### Agent 1: Smart Repair Diagnosis (`agentDiagnosis`)
- **Purpose**: Performs multimodal breakdown of hardware defects from text description, symptom choices, and photographic evidence.
- **Model**: `gemini-3.5-flash` / `gemini-3.1-pro-preview` with structured JSON output.
- **Output Parameters**:
  - `probable_causes`: List of likely faults with probability and severity.
  - `diy_possible`: Whether the user can resolve the issue without opening dangerous components.
  - `diy_guide_persian`: Step-by-step safe troubleshooting instructions.
  - `estimated_price_min` & `estimated_price_max`: Price range in Iranian Tomans.
  - `required_parts`: Identified spare parts with tier recommendations (*Original*, *Grade A*, *Economy*).
  - `safety_warnings`: High-voltage, gas leak, or mechanical warnings.
  - `confidence_score`: 0-100% confidence.

### Agent 2: Smart Technician Matching & Bid Scorer (`agentMatching`)
- **Purpose**: Evaluates candidate technicians based on geographical proximity, historical rating, completed jobs, response speed, warranty compliance percentage, and level tier bonus.
- **Algorithm**:
  $$\text{Score} = (100 - 4 \times \text{dist}) \times 0.30 + (\text{rating}/5 \times 100) \times 0.30 + \text{warranty\_rate} \times 0.15 + (100 - \text{resp\_min}) \times 0.15 + \text{jobs\_score} \times 0.10 + \text{level\_bonus}$$
- **Modes**:
  - `fast`: Instantly binds highest-scoring verified technician within radius.
  - `bidding`: Broadcasts request to top 5 technicians for competitive price proposals.

### Agent 3: Dispute Arbitrator (`agentDispute`)
- **Purpose**: Impartial technical arbiter analyzing disputed repair jobs by comparing before & after photos, SOP logs, defect description, and warranty validity.
- **Output**: Fault attribution probabilities (technician vs customer vs external factors), verdict in Persian, escrow disbursement allocation (*100% refund, partial, split, or free revisit*).

### Agent 4: Quality Control & Auto-Escrow Releaser (`agentQualityCheck`)
- **Purpose**: Audits work completion photos, verifies workspace cleanliness, cross-checks SOP items, generates a quality score, and authorizes the immediate 85% labor release to the technician wallet while locking 15% in warranty escrow.

### Agent 5: Predictive Periodic Service Reminders (`agentReminders`)
- **Purpose**: Models appliance wear, season transitions (e.g. AC pre-summer checkups, heater pre-winter descaling), and elapsed days since last maintenance to dispatch friendly, contextual Persian service prompts.

### Agent 6: Anti-Fraud Pattern Analyzer (`agentFraudDetection`)
- **Purpose**: Monitors anomalous behavior, abnormal pricing, fake review rings, and bypass attempts, assigning risk levels (*Low, Medium, High, Critical*).

### Agent 7: Interactive Support Chatbot (`agentSupport`)
- **Purpose**: Conversational multi-turn support assistant embedded directly in the app. Answers platform questions, retrieves order status, clarifies escrow rules, and escalates to human agents when needed.

### Agent 8: Marketing & Loyalty Generator (`agentMarketing`)
- **Purpose**: Generates targeted push notifications, referral campaigns, and seasonal offers formatted in warm Persian copy.

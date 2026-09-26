package com.example.data.remote

import org.json.JSONObject

/** Results returned by Oosta's authenticated server-side AI gateway. */
data class AiDiagnosisResult(
    val probableCauses: List<String>,
    val diyPossible: Boolean,
    val diyGuideFa: String,
    val estimatedPriceMin: Long,
    val estimatedPriceMax: Long,
    val requiredParts: List<String>,
    val safetyWarnings: List<String>,
    val confidenceScore: Float,
    val summaryFa: String
)

data class AiDisputeResult(
    val verdictSummaryFa: String,
    val faultTechnicianPercent: Int,
    val faultCustomerPercent: Int,
    val recommendedAction: String,
    val refundAmountTomans: Long,
    val reasoningFa: String,
    val confidenceScore: Float
)

data class AiQualityCheckResult(
    val qualityScore: Int,
    val checklistVerified: Boolean,
    val cleanlinessApproved: Boolean,
    val partsAuthenticityApproved: Boolean,
    val feedbackFa: String,
    val authorizeEscrowRelease: Boolean
)

data class AiReminderResult(
    val titleFa: String,
    val messageFa: String,
    val priority: String,
    val recommendedService: String
)

data class AiSupportResponse(
    val replyFa: String,
    val suggestedActions: List<String>,
    val shouldEscalateToHuman: Boolean
)

/**
 * Compatibility facade for existing UI. Network inference is server-side and all
 * unavailable/low-confidence cases are explicitly non-binding and routed to people.
 */
class GeminiAiEngine(
    private val providerRouter: AiProviderRouter = AiProviderRouter()
) {
    suspend fun diagnoseIssue(
        category: String,
        symptomDescription: String,
        imageBase64List: List<String> = emptyList()
    ): AiDiagnosisResult = try {
        parseDiagnosisJson(providerRouter.diagnose(category, symptomDescription, imageBase64List))
    } catch (error: Exception) {
        unavailableDiagnosis()
    }

    // Financial and dispute decisions are never delegated to an AI fallback.
    suspend fun arbitrateDispute(
        orderSummary: String,
        customerComplaint: String,
        technicianNotes: String,
        beforeAfterImages: List<String> = emptyList()
    ): AiDisputeResult = AiDisputeResult(
        verdictSummaryFa = "پرونده برای بررسی کارشناس انسانی ثبت می‌شود.",
        faultTechnicianPercent = 0,
        faultCustomerPercent = 0,
        recommendedAction = "no_action",
        refundAmountTomans = 0L,
        reasoningFa = "هوش مصنوعی مجاز به تصمیم‌گیری دربارهٔ اختلاف، بازپرداخت یا آزادسازی وجه نیست.",
        confidenceScore = 0f
    )

    // A quality hint cannot release money; only the server-side operator workflow can.
    suspend fun auditJobQuality(
        category: String,
        checklistCompleted: Boolean,
        workSummary: String,
        afterImages: List<String> = emptyList()
    ): AiQualityCheckResult = AiQualityCheckResult(
        qualityScore = 0,
        checklistVerified = false,
        cleanlinessApproved = false,
        partsAuthenticityApproved = false,
        feedbackFa = "بررسی کیفیت و هرگونه تسویه نیازمند تأیید انسانی است.",
        authorizeEscrowRelease = false
    )

    suspend fun generatePredictiveReminder(
        deviceName: String,
        category: String,
        healthScore: Int,
        lastServiceDate: String
    ): AiReminderResult {
        val priority = when {
            healthScore < 60 -> "urgent"
            healthScore < 80 -> "high"
            else -> "normal"
        }
        return AiReminderResult(
            titleFa = "یادآوری سرویس دوره‌ای",
            messageFa = "برای $deviceName زمان بررسی دوره‌ای فرا رسیده است. زمان سرویس با تأیید کارشناس تعیین می‌شود.",
            priority = priority,
            recommendedService = "درخواست بررسی اولیه"
        )
    }

    suspend fun chatSupport(
        userMessage: String,
        chatHistory: List<Pair<String, String>> = emptyList()
    ): AiSupportResponse = AiSupportResponse(
        replyFa = "برای راهنمایی دقیق، درخواست شما به پشتیبانی اوستا ارجاع می‌شود. نتیجهٔ خودکار جایگزین بررسی کارشناس نیست.",
        suggestedActions = listOf("ثبت درخواست بررسی", "ارتباط با پشتیبانی"),
        shouldEscalateToHuman = true
    )

    private fun parseDiagnosisJson(rawJson: String): AiDiagnosisResult {
        val clean = rawJson.trim().removePrefix("```json").removePrefix("```").removeSuffix("```").trim()
        val json = JSONObject(clean)
        val causes = json.stringList("probable_causes")
        val parts = json.stringList("required_parts")
        val warnings = json.stringList("safety_warnings")
        val min = json.optLong("estimated_price_min", 0L).coerceAtLeast(0L)
        val max = json.optLong("estimated_price_max", 0L).coerceAtLeast(min)
        return AiDiagnosisResult(
            probableCauses = causes.ifEmpty { listOf("اطلاعات کافی برای تشخیص اولیه وجود ندارد.") },
            diyPossible = json.optBoolean("diy_possible", false),
            diyGuideFa = json.optString("diy_guide_persian").ifBlank { "برای ایمنی، دستگاه را از برق جدا کرده و منتظر بررسی کارشناس بمانید." },
            estimatedPriceMin = min,
            estimatedPriceMax = max,
            requiredParts = parts,
            safetyWarnings = warnings.ifEmpty { listOf("تشخیص اولیه است و نباید جایگزین بررسی حضوری شود.") },
            confidenceScore = json.optDouble("confidence_score", 0.0).toFloat().coerceIn(0f, 100f),
            summaryFa = json.optString("summary_fa").ifBlank { "نتیجهٔ اولیه برای بررسی کارشناس ثبت شد." }
        )
    }

    private fun JSONObject.stringList(name: String): List<String> {
        val array = optJSONArray(name) ?: return emptyList()
        return buildList {
            for (index in 0 until array.length()) {
                array.optString(index).trim().takeIf { it.isNotEmpty() }?.let(::add)
            }
        }
    }

    private fun unavailableDiagnosis() = AiDiagnosisResult(
        probableCauses = listOf("تشخیص خودکار در دسترس نیست."),
        diyPossible = false,
        diyGuideFa = "دستگاه را از برق جدا کنید و برای بررسی ایمن با پشتیبانی تماس بگیرید.",
        estimatedPriceMin = 0L,
        estimatedPriceMax = 0L,
        requiredParts = emptyList(),
        safetyWarnings = listOf("هیچ قیمت یا تشخیص خودکاری در این وضعیت معتبر نیست."),
        confidenceScore = 0f,
        summaryFa = "درخواست برای بررسی انسانی ثبت نشد؛ لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید."
    )
}

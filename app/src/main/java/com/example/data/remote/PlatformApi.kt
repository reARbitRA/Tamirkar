package com.example.data.remote

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class PlatformFeatures(
    val aiDiagnosis: Boolean = false,
    val newBookings: Boolean = false,
    val payments: Boolean = false,
    val technicianMatching: Boolean = false,
    val escrowRelease: Boolean = false
)

data class SubmittedOrder(
    val id: String,
    val status: String
)

/**
 * Client for platform capabilities that are explicitly enabled by the server. Client-side
 * switches are not trusted: every protected operation is checked again server-side.
 */
class PlatformApi(
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .build()
) {
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    suspend fun getFeatures(): PlatformFeatures = withContext(Dispatchers.IO) {
        val request = Request.Builder().url("${OostaApiConfig.requireBaseUrl()}/v1/public/features").get().build()
        http.newCall(request).execute().use { response ->
            val payload = JSONObject(response.body?.string().orEmpty())
            if (!response.isSuccessful) throw AuthApiException("دریافت وضعیت سرویس‌ها ممکن نیست.")
            val features = payload.optJSONObject("features") ?: JSONObject()
            PlatformFeatures(
                aiDiagnosis = features.optBoolean("ai_diagnosis", false),
                newBookings = features.optBoolean("new_bookings", false),
                payments = features.optBoolean("payments", false),
                technicianMatching = features.optBoolean("technician_matching", false),
                escrowRelease = features.optBoolean("escrow_release", false)
            )
        }
    }

    suspend fun createOrder(category: String, problemDescription: String): SubmittedOrder = withContext(Dispatchers.IO) {
        val payload = JSONObject()
            .put("category", category)
            .put("problem_description", problemDescription)
        val request = Request.Builder()
            .url("${OostaApiConfig.requireBaseUrl()}/v1/orders")
            .header("Authorization", "Bearer ${AuthSessionStore.bearerToken()}")
            .post(payload.toString().toRequestBody(jsonType))
            .build()
        http.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            val json = runCatching { JSONObject(raw) }.getOrDefault(JSONObject())
            if (!response.isSuccessful) {
                throw AuthApiException(json.optString("message").ifBlank { "ثبت درخواست ممکن نیست." })
            }
            val id = json.optString("id")
            if (id.isBlank()) throw AuthApiException("پاسخ ثبت درخواست معتبر نیست.")
            SubmittedOrder(id, json.optString("status", "submitted"))
        }
    }
}

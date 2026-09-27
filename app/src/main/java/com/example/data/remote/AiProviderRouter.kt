package com.example.data.remote

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Authenticated client for Oosta's server-side AI gateway. The APK contains no model
 * provider keys and never calls Gemini, Groq, Cerebras, Hugging Face, or OpenRouter.
 */
class AiProviderRouter(
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .build()
) {
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    suspend fun diagnose(category: String, symptom: String, images: List<String> = emptyList()): String =
        withContext(Dispatchers.IO) {
            val payload = JSONObject()
                .put("category", category)
                .put("symptom", symptom)
                .put("images", images.take(2))
            val request = Request.Builder()
                .url("${OostaApiConfig.requireBaseUrl()}/v1/ai/diagnoses")
                .header("Authorization", "Bearer ${AuthSessionStore.bearerToken()}")
                .post(payload.toString().toRequestBody(jsonType))
                .build()
            http.newCall(request).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                val json = runCatching { JSONObject(raw) }.getOrDefault(JSONObject())
                if (!response.isSuccessful) {
                    throw AiGatewayException(json.optString("message").ifBlank { "تشخیص هوشمند در دسترس نیست." })
                }
                json.optString("result").ifBlank { throw AiGatewayException("پاسخ تشخیص معتبر نیست.") }
            }
        }
}

class AiGatewayException(message: String) : RuntimeException(message)

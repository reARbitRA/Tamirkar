package com.example.data.remote

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class OtpRequestResult(
    val phone: String,
    val expiresInSeconds: Int,
    val resendAfterSeconds: Int
)

data class AuthSession(
    val accessToken: String,
    val expiresInSeconds: Int,
    val userId: String,
    val phone: String,
    val role: String
)

class AuthApiException(message: String) : IllegalStateException(message)

/**
 * Small client for the server-side OTP API. It never contains Kavenegar credentials
 * or generates verification codes; both operations stay in services/auth-api.
 */
class AuthApi(
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()
) {
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    suspend fun requestOtp(phone: String): OtpRequestResult = withContext(Dispatchers.IO) {
        val response = post("/v1/auth/request-otp", JSONObject().put("phone", phone))
        OtpRequestResult(
            phone = phone,
            expiresInSeconds = response.optInt("expires_in_seconds", 300),
            resendAfterSeconds = response.optInt("resend_after_seconds", 60)
        )
    }

    suspend fun verifyOtp(phone: String, code: String): AuthSession = withContext(Dispatchers.IO) {
        val response = post("/v1/auth/verify-otp", JSONObject().put("phone", phone).put("code", code))
        val user = response.optJSONObject("user") ?: throw AuthApiException("پاسخ ورود معتبر نیست.")
        val token = response.optString("access_token")
        if (token.isBlank()) throw AuthApiException("پاسخ ورود معتبر نیست.")
        AuthSession(
            accessToken = token,
            expiresInSeconds = response.optInt("expires_in_seconds", 0),
            userId = user.optString("id"),
            phone = user.optString("phone"),
            role = user.optString("role")
        )
    }

    private fun post(path: String, payload: JSONObject): JSONObject {
        val request = Request.Builder()
            .url("${baseUrl()}$path")
            .post(payload.toString().toRequestBody(jsonType))
            .build()
        http.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            val json = runCatching { JSONObject(raw) }.getOrDefault(JSONObject())
            if (!response.isSuccessful) {
                throw AuthApiException(json.optString("message").ifBlank { "ارتباط با سرویس ورود ممکن نیست. لطفاً دوباره تلاش کنید." })
            }
            return json
        }
    }

    private fun baseUrl(): String = OostaApiConfig.requireBaseUrl()
}

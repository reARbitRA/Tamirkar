package com.example.data.remote

import com.example.BuildConfig

/** The Android app may know the public API URL, but never a provider or database secret. */
object OostaApiConfig {
    fun requireBaseUrl(): String {
        val value = buildConfigString("AUTH_API_BASE_URL").trim().trimEnd('/')
        val isDebugEmulator = BuildConfig.DEBUG && value == "http://10.0.2.2:8080"
        if (value.isBlank() || value.contains("example.invalid") || (!value.startsWith("https://") && !isDebugEmulator)) {
            throw AuthApiException("نشانی امن سرویس ورود تنظیم نشده است.")
        }
        return value
    }

    private fun buildConfigString(name: String): String = try {
        (BuildConfig::class.java.getField(name).get(null) as? String).orEmpty()
    } catch (_: Exception) {
        ""
    }
}

package com.example.data.remote

import com.example.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Provider-agnostic AI gateway. API keys stay in BuildConfig; model IDs are configurable. */
enum class AiTask(val requiresVision: Boolean) {
    DIAGNOSIS(true), DISPUTE(true), QUALITY_CHECK(true), SUPPORT(false), REMINDER(false)
}

data class ProviderAttempt(val provider: String, val model: String, val success: Boolean, val error: String? = null)

data class AiGatewayResponse(val text: String, val attempts: List<ProviderAttempt>)

class AiProviderRouter(
    private val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).build()
) {
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    suspend fun complete(task: AiTask, prompt: String, images: List<String> = emptyList()): AiGatewayResponse =
        withContext(Dispatchers.IO) {
            val attempts = mutableListOf<ProviderAttempt>()
            candidates(task, images.isNotEmpty()).forEach { candidate ->
                if (candidate.key.isBlank()) return@forEach
                try {
                    val text = if (candidate.kind == Kind.GEMINI) {
                        gemini(candidate, prompt, images)
                    } else {
                        openAiCompatible(candidate, prompt, images)
                    }
                    attempts += ProviderAttempt(candidate.name, candidate.model, true)
                    return@withContext AiGatewayResponse(text, attempts)
                } catch (e: Exception) {
                    attempts += ProviderAttempt(candidate.name, candidate.model, false, e.message)
                }
            }
            throw AiGatewayException("No configured AI provider succeeded", attempts)
        }

    /** Ordered by capability and expected free-tier suitability, not by hard-coded availability. */
    internal fun candidates(task: AiTask, hasImages: Boolean): List<Candidate> = when {
        task.requiresVision || hasImages -> listOfNotNull(
            candidate("Google AI Studio", "GEMINI_API_KEY", "GEMINI_MODEL", "gemini-2.5-flash", Kind.GEMINI, true),
            candidate("Groq", "GROQ_API_KEY", "GROQ_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct", Kind.OPENAI, true),
            candidate("Hugging Face", "HF_TOKEN", "HF_MODEL", "Qwen/Qwen2.5-VL-3B-Instruct", Kind.OPENAI, true),
            candidate("OpenRouter", "OPENROUTER_API_KEY", "OPENROUTER_VISION_MODEL", "openrouter/free", Kind.OPENAI, true)
        )
        else -> listOfNotNull(
            candidate("Groq", "GROQ_API_KEY", "GROQ_MODEL", "openai/gpt-oss-120b", Kind.OPENAI, false),
            candidate("Cerebras", "CEREBRAS_API_KEY", "CEREBRAS_MODEL", "gpt-oss-120b", Kind.OPENAI, false),
            candidate("OpenRouter", "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "openrouter/free", Kind.OPENAI, false),
            candidate("Hugging Face", "HF_TOKEN", "HF_MODEL", "openai/gpt-oss-120b", Kind.OPENAI, false),
            candidate("Google AI Studio", "GEMINI_API_KEY", "GEMINI_MODEL", "gemini-2.5-flash", Kind.GEMINI, false)
        )
    }

    private fun candidate(name: String, keyName: String, modelName: String, defaultModel: String, kind: Kind, vision: Boolean) =
        Candidate(name, readConfig(keyName), readConfig(modelName).ifBlank { defaultModel }, kind, vision)

    private fun readConfig(name: String): String = try {
        val field = BuildConfig::class.java.getField(name)
        (field.get(null) as? String).orEmpty().takeUnless { it == "MY_${name}" } ?: ""
    } catch (_: Exception) { "" }

    private fun gemini(c: Candidate, prompt: String, images: List<String>): String {
        val parts = JSONArray().put(JSONObject().put("text", prompt))
        images.take(2).forEach { image ->
            parts.put(JSONObject().put("inlineData", JSONObject().put("mimeType", "image/jpeg").put("data", image)))
        }
        val body = JSONObject().put("contents", JSONArray().put(JSONObject().put("parts", parts)))
            .put("generationConfig", JSONObject().put("temperature", 0.2)).toString()
        val request = Request.Builder()
            .url("https://generativelanguage.googleapis.com/v1beta/models/${c.model}:generateContent?key=${c.key}")
            .post(body.toRequestBody(jsonType)).build()
        val json = execute(request)
        return json.getJSONArray("candidates").getJSONObject(0).getJSONObject("content")
            .getJSONArray("parts").getJSONObject(0).getString("text")
    }

    private fun openAiCompatible(c: Candidate, prompt: String, images: List<String>): String {
        val content: Any = if (images.isEmpty()) prompt else {
            val items = JSONArray().put(JSONObject().put("type", "text").put("text", prompt))
            images.take(2).forEach { image ->
                items.put(JSONObject().put("type", "image_url").put("image_url", JSONObject().put("url", "data:image/jpeg;base64,$image")))
            }
            items
        }
        val messages = JSONArray().put(JSONObject().put("role", "user").put("content", content))
        val body = JSONObject().put("model", c.model).put("messages", messages)
            .put("temperature", 0.2).toString()
        val base = when (c.name) {
            "Groq" -> "https://api.groq.com/openai/v1"
            "Cerebras" -> "https://api.cerebras.ai/v1"
            "Hugging Face" -> "https://router.huggingface.co/v1"
            else -> "https://openrouter.ai/api/v1"
        }
        val request = Request.Builder().url("$base/chat/completions")
            .addHeader("Authorization", "Bearer ${c.key}")
            .addHeader("Content-Type", "application/json")
            .post(body.toRequestBody(jsonType)).build()
        val json = execute(request)
        return json.getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content")
    }

    private fun execute(request: Request): JSONObject {
        http.newCall(request).execute().use { response ->
            val raw = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IllegalStateException("HTTP ${response.code}: ${raw.take(300)}")
            return JSONObject(raw)
        }
    }

    internal data class Candidate(val name: String, val key: String, val model: String, val kind: Kind, val supportsVision: Boolean)
    private enum class Kind { GEMINI, OPENAI }
}

class AiGatewayException(message: String, val attempts: List<ProviderAttempt>) : RuntimeException(message)

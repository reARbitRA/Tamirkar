package com.example

import com.example.data.remote.AiProviderRouter
import com.example.data.remote.AiTask
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AiProviderRouterTest {
    @Test
    fun textTasksPreferFastOpenAiCompatibleProviders() {
        val candidates = AiProviderRouter().candidates(AiTask.SUPPORT, hasImages = false)
        assertEquals(listOf("Groq", "Cerebras", "OpenRouter", "Hugging Face", "Google AI Studio"), candidates.map { it.name })
        assertTrue(candidates.take(4).all { !it.supportsVision })
    }

    @Test
    fun visionTasksOnlyIncludeVisionCapableCandidates() {
        val candidates = AiProviderRouter().candidates(AiTask.DIAGNOSIS, hasImages = true)
        assertTrue(candidates.all { it.supportsVision })
        assertEquals("Google AI Studio", candidates.first().name)
    }

    @Test
    fun taskCapabilityRequiresVisionEvenWithoutAnImage() {
        val candidates = AiProviderRouter().candidates(AiTask.QUALITY_CHECK, hasImages = false)
        assertTrue(candidates.all { it.supportsVision })
    }
}

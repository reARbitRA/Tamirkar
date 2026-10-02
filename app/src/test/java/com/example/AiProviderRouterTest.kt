package com.example

import com.example.data.remote.AiGatewayException
import com.example.data.remote.AiProviderRouter
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Contract tests for the server-side AI gateway client.
 *
 * These replace an earlier version of this file that asserted a multi-provider `candidates()`
 * API and an `AiTask` enum which no longer exist in the module. Provider keys, model selection
 * and failover all live in `services/auth-api`; the APK's only job is to authenticate to Oosta's
 * own gateway. Every assertion below references a symbol that exists in `app/src/main`.
 */
class AiProviderRouterTest {

    @Test
    fun gatewayExceptionCarriesTheServerMessage() {
        val error = AiGatewayException("تشخیص هوشمند در دسترس نیست.")
        assertEquals("تشخیص هوشمند در دسترس نیست.", error.message)
        assertTrue("the UI catches RuntimeException, so the gateway error must be one", error is RuntimeException)
    }

    @Test
    fun routerCanBeConstructedWithoutProviderCredentials() {
        // The constructor takes no API key, no endpoint and no provider list. If this ever needs
        // one, a secret is about to be shipped inside the APK.
        val router = AiProviderRouter()
        assertNotNull(router)
        val constructors = AiProviderRouter::class.java.declaredConstructors
        assertTrue(
            "AiProviderRouter must never require a credential to construct",
            constructors.all { ctor -> ctor.parameterTypes.none { it == String::class.java } }
        )
    }

    @Test
    fun routerSourceDoesNotReferenceAnyThirdPartyInferenceHost() {
        val source = java.io.File("src/main/java/com/example/data/remote/AiProviderRouter.kt").readText()
        for (host in listOf("generativelanguage.googleapis.com", "api.groq.com", "api.cerebras.ai", "openrouter.ai", "api-inference.huggingface.co")) {
            assertTrue(
                "AiProviderRouter must not call $host directly; inference is server-side",
                !source.contains(host)
            )
        }
        assertTrue(
            "AiProviderRouter must target Oosta's own gateway path",
            source.contains("/v1/ai/diagnoses")
        )
        assertTrue(
            "AiProviderRouter must send the session bearer token",
            source.contains("AuthSessionStore.bearerToken()")
        )
        assertTrue(
            "At most two images may leave the device",
            source.contains("images.take(2)")
        )
    }

    @Test
    fun diagnosisRequestRejectsAMissingSessionBeforeAnyNetworkCall() {
        // With no session in the memory-only store, the router must fail fast rather than send an
        // unauthenticated request to the gateway.
        com.example.data.remote.AuthSessionStore.clear()
        val router = AiProviderRouter()
        try {
            kotlinx.coroutines.runBlocking { router.diagnose("یخچال", "یخچال سرمایش ندارد") }
            fail("expected the router to throw when no session is present")
        } catch (expected: Exception) {
            assertNotNull(expected.message)
        }
    }
}

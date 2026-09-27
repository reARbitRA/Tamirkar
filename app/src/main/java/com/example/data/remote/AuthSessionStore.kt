package com.example.data.remote

/**
 * Deliberately memory-only in this increment: access tokens are never written to Room,
 * logs, or a plain preference. A durable encrypted refresh-session design is required
 * before passwordless session restoration is introduced.
 */
object AuthSessionStore {
    @Volatile private var accessToken: String? = null

    fun set(session: AuthSession) {
        accessToken = session.accessToken
    }

    fun bearerToken(): String = accessToken ?: throw AuthApiException("نشست ورود شما پایان یافته است. دوباره وارد شوید.")

    fun clear() {
        accessToken = null
    }
}

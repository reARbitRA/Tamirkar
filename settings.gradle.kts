pluginManagement {
  repositories {
    google {
      content {
        includeGroupByRegex("com\\.android.*")
        includeGroupByRegex("com\\.google.*")
        includeGroupByRegex("androidx.*")
      }
    }
    mavenCentral()
    gradlePluginPortal()
  }
}

plugins { id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0" }

// CI diagnostics: emit workflow notices/errors so run metadata shows how far
// the build got and WHY it failed, even when raw logs cannot be fetched.
gradle.addBuildListener(object : BuildListener {
  override fun buildStarted(gradle: Gradle) {}
  override fun settingsEvaluated(settings: Settings) {
    println("::notice title=PHASE::SETTINGS_EVALUATED_OK")
  }
  override fun projectsLoaded(gradle: Gradle) {
    println("::notice title=PHASE::PROJECTS_LOADED_OK")
  }
  override fun projectsEvaluated(gradle: Gradle) {
    println("::notice title=PHASE::PROJECTS_EVALUATED_OK")
  }
  override fun buildFinished(result: BuildResult) {
    val failure = result.failure
    if (failure != null) {
      val messages = mutableListOf<String>()
      var current: Throwable? = failure
      while (current != null && messages.size < 8) {
        val message = current.message
        if (message != null) messages.add(message)
        current = current.cause
      }
      val chain = messages.joinToString(" | ").replace("\n", " ").take(3000)
      println("::error title=BUILD_FAILURE::$chain")
    } else {
      println("::notice title=PHASE::BUILD_FINISHED_OK")
    }
  }
})

dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    google()
    mavenCentral()
  }
}

rootProject.name = "Tamirkar"

include(":app")

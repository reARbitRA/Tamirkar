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

// Emit the failure chain of ANY build failure as a GitHub Actions ::error
// annotation, so CI failures are diagnosable from run metadata even when raw
// logs cannot be fetched. Works for configuration-time and execution-time failures.
gradle.buildFinished { result ->
  val failure = result.failure
  if (failure != null) {
    try {
      val phase = if (gradle.taskGraph.allTasks.isEmpty()) "CONFIGURATION" else "EXECUTION"
      val chain = generateSequence(failure as Throwable?) { it.cause }
        .take(8)
        .mapNotNull { it.message }
        .joinToString(" | ")
        .replace("\n", " ")
        .take(3000)
      println("::error title=BUILD_FAILURE[$phase]::$chain")
    } catch (_: Exception) {
      println("::error title=BUILD_FAILURE::${failure.message?.replace("\n", " ")?.take(3000)}")
    }
  }
}

dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    google()
    mavenCentral()
  }
}

rootProject.name = "Tamirkar"

include(":app")

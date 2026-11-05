plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val dashboardUrl: String =
    System.getenv("DASHBOARD_URL")?.takeIf { it.isNotBlank() }
        ?: (project.findProperty("dashboardUrl") as String?)
        ?: "https://YOUR-APP.vercel.app/tv"

android {
    namespace = "com.el7ajb.today"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.el7ajb.today"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "DASHBOARD_URL", "\"$dashboardUrl\"")
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

package com.anythingllm

import android.app.Application
import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.SystemClock
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import cat.ereza.customactivityoncrash.CustomActivityOnCrash
import cat.ereza.customactivityoncrash.config.CaocConfig
import com.anythingllm.download.DownloadPackage
import com.anythingllm.storage.StoragePackage
import com.anythingllm.vector.VectorBoxPackage
import com.anythingllm.webscraper.WebScraperPackage
import com.anythingllm.pdfparser.PdfParserPackage
import com.anythingllm.scheduledjobs.ScheduledJobsPackage
import com.anythingllm.sharedcontent.SharedContentPackage
import com.anythingllm.quickcontext.QuickContextPackage
import com.anythingllm.assistant.AssistantPackage
import com.anythingllm.messaging.MessagingPackage
import com.anythingllm.alarms.AlarmPackage
import com.anythingllm.loopbackauth.LoopbackAuthPackage
import com.anythingllm.termux.TermuxBridgePackage
import com.anythingllm.updater.InAppUpdaterPackage
import com.anythingllm.startuptiming.StartupTimingPackage

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> {
          val packages = PackageList(this).packages.toMutableList()
          val registeredPackageClasses = packages.mapTo(mutableSetOf<String>()) { it.javaClass.name }
          val manuallyRegisteredPackages = listOf(
            DeviceInfoPackage(),
            KeepAwakePackage(),
            ScreenLockPackage(),
            DownloadPackage(),
            StoragePackage(),
            VectorBoxPackage(),
            WebScraperPackage(),
            PdfParserPackage(),
            ScheduledJobsPackage(),
            SharedContentPackage(),
            QuickContextPackage(),
            AssistantPackage(),
            MessagingPackage(),
            AlarmPackage(),
            LoopbackAuthPackage(),
            TermuxBridgePackage(),
            InAppUpdaterPackage(),
            StartupTimingPackage(),
          )

          manuallyRegisteredPackages.forEach { packageInstance ->
            if (registeredPackageClasses.add(packageInstance.javaClass.name)) {
              packages.add(packageInstance)
            }
          }
          return packages
        }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = false

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    processStartElapsedMs = SystemClock.elapsedRealtime()
    // The isolated crash-recovery activity must stay lightweight and must not boot React Native.
    if (isCrashRecoveryProcess()) return
    CaocConfig.Builder.create()
      .enabled(true)
      .showErrorDetails(false)
      .showRestartButton(false)
      .logErrorOnRestart(false)
      .minTimeBetweenCrashesMs(3000)
      .restartActivity(MainActivity::class.java)
      .errorActivity(CrashRecoveryActivity::class.java)
      .apply()
    CustomActivityOnCrash.install(this)
    try {
      loadReactNative(this)
    } catch (error: Throwable) {
      Log.e(TAG, "Failed to load React Native during application startup", error)
      throw RuntimeException("Failed to load React Native during application startup", error)
    }
  }

  private fun isCrashRecoveryProcess(): Boolean {
    val processName = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      Application.getProcessName()
    } else {
      val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
      activityManager?.runningAppProcesses
        ?.firstOrNull { it.pid == android.os.Process.myPid() }
        ?.processName
    }
    return processName?.endsWith(":error_activity") == true
  }

  companion object {
    private const val TAG = "MainApplication"
    @Volatile
    @JvmField
    var processStartElapsedMs: Long = 0L
  }
}

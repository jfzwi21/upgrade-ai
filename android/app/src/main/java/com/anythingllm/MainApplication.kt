package com.anythingllm

import android.app.Application
import android.util.Log
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
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
    CaocConfig.Builder.create()
      .enabled(true)
      .showErrorDetails(true)
      .showRestartButton(true)
      .apply()
    try {
      loadReactNative(this)
    } catch (error: Throwable) {
      Log.e(TAG, "Failed to load React Native during application startup", error)
    }
  }

  private companion object {
    const val TAG = "MainApplication"
  }
}

package com.anythingllm.startuptiming

import android.os.SystemClock
import com.anythingllm.MainApplication
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class StartupTimingModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "StartupTimingModule"

  @ReactMethod
  fun getProcessUptimeMs(promise: Promise) {
    val startedAt = MainApplication.processStartElapsedMs
    if (startedAt <= 0L) {
      promise.reject("START_TIME_UNAVAILABLE", "Android process start time is unavailable.")
      return
    }
    promise.resolve((SystemClock.elapsedRealtime() - startedAt).coerceAtLeast(0L).toDouble())
  }
}

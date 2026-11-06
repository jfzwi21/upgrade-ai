package com.anythingllm

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.widget.TextView
import cat.ereza.customactivityoncrash.CustomActivityOnCrash

/**
 * Runs in the library's isolated error process. It deliberately renders only a
 * brief recovery message, then restarts the launcher activity through the
 * library's task-clearing restart path. Safe-mode boot accounting happens in JS.
 */
class CrashRecoveryActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private val restartTask = Runnable {
    val config = CustomActivityOnCrash.getConfigFromIntent(intent)
    if (config != null) {
      CustomActivityOnCrash.restartApplication(this, config)
      return@Runnable
    }

    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    if (launchIntent != null) {
      launchIntent.addFlags(
        android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
          android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK or
          android.content.Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED,
      )
      startActivity(launchIntent)
    }
    finish()
    android.os.Process.killProcess(android.os.Process.myPid())
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    window.statusBarColor = Color.rgb(16, 17, 20)
    window.navigationBarColor = Color.rgb(16, 17, 20)

    setContentView(
      TextView(this).apply {
        text = "حدث خلل؛ جارٍ استعادة التطبيق بأمان…"
        textSize = 16f
        setTextColor(Color.WHITE)
        gravity = Gravity.CENTER
        setPadding(36, 36, 36, 36)
      },
    )
    handler.postDelayed(restartTask, 800L)
  }

  override fun onDestroy() {
    handler.removeCallbacks(restartTask)
    super.onDestroy()
  }
}

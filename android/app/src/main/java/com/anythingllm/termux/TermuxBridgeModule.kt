package com.anythingllm.termux

import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/** Executes an explicitly approved shell command in Termux and returns its output. */
class TermuxBridgeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "TermuxBridge"

    @ReactMethod
    fun runCommand(command: String, workingDirectory: String?, promise: Promise) {
        if (command.isBlank()) {
            promise.reject("TERMUX_INVALID_COMMAND", "A non-empty shell command is required")
            return
        }

        if (reactApplicationContext.checkSelfPermission(RUN_COMMAND_PERMISSION) != PackageManager.PERMISSION_GRANTED) {
            promise.reject(
                "TERMUX_PERMISSION_DENIED",
                "Grant the Run commands in Termux permission to Upgrade AI in Android app permissions."
            )
            return
        }

        val requestCode = nextRequestCode.getAndIncrement()
        var resultPendingIntent: PendingIntent? = null
        try {
            val callbackIntent = Intent(reactApplicationContext, TermuxCommandResultReceiver::class.java).apply {
                action = ACTION_TERMUX_RESULT
                putExtra(EXTRA_REQUEST_CODE, requestCode)
            }
            val pendingIntentFlags = PendingIntent.FLAG_ONE_SHOT or
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
            val callbackPendingIntent = PendingIntent.getBroadcast(
                reactApplicationContext,
                requestCode,
                callbackIntent,
                pendingIntentFlags
            )
            resultPendingIntent = callbackPendingIntent

            val runIntent = Intent(ACTION_RUN_COMMAND).apply {
                setClassName(TERMUX_PACKAGE, TERMUX_RUN_COMMAND_SERVICE)
                putExtra(EXTRA_COMMAND_PATH, TERMUX_BASH_PATH)
                putExtra(EXTRA_ARGUMENTS, arrayOf("-lc", command))
                putExtra(EXTRA_WORKDIR, workingDirectory?.trim().takeUnless { it.isNullOrEmpty() } ?: TERMUX_HOME)
                // Background mode is required for Termux to return stdout and stderr separately.
                putExtra(EXTRA_BACKGROUND, true)
                putExtra(EXTRA_PENDING_INTENT, callbackPendingIntent)
            }

            val timeoutTask = Runnable {
                val pending = pendingPromises.remove(requestCode) ?: return@Runnable
                pending.pendingIntent.cancel()
                pending.promise.reject(
                    "TERMUX_COMMAND_TIMEOUT",
                    "Termux did not return a result within the allowed time."
                )
            }
            pendingPromises[requestCode] = PendingTermuxRequest(promise, callbackPendingIntent, timeoutTask)
            mainHandler.postDelayed(timeoutTask, COMMAND_TIMEOUT_MS)
            reactApplicationContext.startService(runIntent)
        } catch (error: Exception) {
            pendingPromises.remove(requestCode)?.let { pending ->
                mainHandler.removeCallbacks(pending.timeoutTask)
                pending.pendingIntent.cancel()
            }
            resultPendingIntent?.cancel()
            promise.reject(
                "TERMUX_COMMAND_START_FAILED",
                error.message ?: "Could not start the Termux command service",
                error
            )
        }
    }

    override fun invalidate() {
        pendingPromises.entries.toList().forEach { (requestCode, pending) ->
            if (pendingPromises.remove(requestCode, pending)) {
                mainHandler.removeCallbacks(pending.timeoutTask)
                pending.pendingIntent.cancel()
                pending.promise.reject("TERMUX_BRIDGE_INVALIDATED", "The Termux bridge was closed before the command completed.")
            }
        }
        super.invalidate()
    }

    companion object {
        private const val RUN_COMMAND_PERMISSION = "com.termux.permission.RUN_COMMAND"
        private const val TERMUX_PACKAGE = "com.termux"
        private const val TERMUX_RUN_COMMAND_SERVICE = "com.termux.app.RunCommandService"
        private const val TERMUX_BASH_PATH = "/data/data/com.termux/files/usr/bin/bash"
        private const val TERMUX_HOME = "/data/data/com.termux/files/home"
        private const val ACTION_RUN_COMMAND = "com.termux.RUN_COMMAND"
        private const val ACTION_TERMUX_RESULT = "com.anythingllm.termux.COMMAND_RESULT"
        private const val EXTRA_COMMAND_PATH = "com.termux.RUN_COMMAND_PATH"
        private const val EXTRA_ARGUMENTS = "com.termux.RUN_COMMAND_ARGUMENTS"
        private const val EXTRA_WORKDIR = "com.termux.RUN_COMMAND_WORKDIR"
        private const val EXTRA_BACKGROUND = "com.termux.RUN_COMMAND_BACKGROUND"
        private const val EXTRA_PENDING_INTENT = "com.termux.RUN_COMMAND_PENDING_INTENT"
        private const val EXTRA_REQUEST_CODE = "com.anythingllm.termux.REQUEST_CODE"
        private const val EXTRA_RESULT_BUNDLE = "result"
        private const val EXTRA_STDOUT = "stdout"
        private const val EXTRA_STDERR = "stderr"
        private const val EXTRA_EXIT_CODE = "exitCode"
        private const val EXTRA_TERMUX_ERROR = "err"
        private const val EXTRA_TERMUX_ERROR_MESSAGE = "errmsg"
        private const val COMMAND_TIMEOUT_MS = 15L * 60L * 1000L

        private val nextRequestCode = AtomicInteger(1000)
        private val mainHandler = Handler(Looper.getMainLooper())
        private val pendingPromises = ConcurrentHashMap<Int, PendingTermuxRequest>()

        private data class PendingTermuxRequest(
            val promise: Promise,
            val pendingIntent: PendingIntent,
            val timeoutTask: Runnable,
        )

        internal fun deliverResult(requestCode: Int, bundle: Bundle?) {
            val pending = pendingPromises.remove(requestCode) ?: return
            mainHandler.removeCallbacks(pending.timeoutTask)
            pending.pendingIntent.cancel()
            val result = Arguments.createMap()
            result.putString("stdout", bundle?.getString(EXTRA_STDOUT).orEmpty())
            result.putString("stderr", bundle?.getString(EXTRA_STDERR).orEmpty())
            result.putInt("resultCode", bundle?.getInt(EXTRA_EXIT_CODE, -1) ?: -1)

            val termuxErrorCode = bundle?.getInt(EXTRA_TERMUX_ERROR, -1) ?: -1
            val termuxErrorMessage = bundle?.getString(EXTRA_TERMUX_ERROR_MESSAGE)
            if (bundle == null) {
                result.putString("error", "Termux did not return a command result. Check that Termux allows external apps and is up to date.")
            } else if (termuxErrorCode != -1 || !termuxErrorMessage.isNullOrBlank()) {
                result.putString("error", termuxErrorMessage ?: "Termux could not start the command (error $termuxErrorCode).")
            }
            pending.promise.resolve(result)
        }
    }
}

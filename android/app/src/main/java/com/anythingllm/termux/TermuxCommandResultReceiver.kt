package com.anythingllm.termux

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle

/** Receives the stdout/stderr/exit-code bundle sent back by Termux. */
class TermuxCommandResultReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val requestCode = intent.getIntExtra(EXTRA_REQUEST_CODE, -1)
        if (requestCode < 0) return
        TermuxBridgeModule.deliverResult(requestCode, intent.getBundleExtra(EXTRA_RESULT_BUNDLE))
    }

    private companion object {
        const val EXTRA_REQUEST_CODE = "com.anythingllm.termux.REQUEST_CODE"
        const val EXTRA_RESULT_BUNDLE = "result"
    }
}

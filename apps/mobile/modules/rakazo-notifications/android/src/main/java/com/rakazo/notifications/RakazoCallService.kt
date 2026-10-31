package com.rakazo.notifications

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder

/**
 * v1 does not keep a call alive in the background. Starting this service used
 * to require a microphone foreground service, which Play will not accept
 * without a demo video. The call stays in the app process and may pause when
 * the app leaves the foreground.
 */
class RakazoCallService : Service() {
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    report(started = false)
    stopSelf()
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun report(started: Boolean) {
    val pending = pendingStart
    pendingStart = null
    pending?.invoke(started)
  }

  companion object {
    /** Answers a start request that is still waiting for [onStartCommand]. */
    private var pendingStart: ((Boolean) -> Unit)? = null

    fun start(context: Context, @Suppress("UNUSED_PARAMETER") title: String, onResult: (Boolean) -> Unit) {
      // Do not start a foreground service. The in-process call continues.
      pendingStart = null
      onResult(false)
      runCatching { context.stopService(Intent(context, RakazoCallService::class.java)) }
    }

    fun stop(context: Context) {
      pendingStart = null
      runCatching { context.stopService(Intent(context, RakazoCallService::class.java)) }
    }
  }
}

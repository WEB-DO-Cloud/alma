package com.rakazo.notifications

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

/**
 * ALMA's Play release strips the foreground-service permissions and service types
 * from the merged manifest (plugins/with-strip-foreground-services.js). Calling
 * startForeground() in that build throws, and a service started with
 * startForegroundService() that never reaches the foreground crashes the whole
 * app. Every foreground start goes through this check first, so the services fall
 * back to in-app behaviour instead of crashing.
 */
internal object ForegroundServiceGate {
  /** Pure decision, kept free of Android types so it runs in local unit tests. */
  fun allowed(
    sdk: Int,
    hasForegroundPermission: Boolean,
    hasTypePermission: Boolean,
    declaredTypes: Int,
    requiredType: Int,
  ): Boolean {
    if (sdk < 26) return true
    if (sdk >= 28 && !hasForegroundPermission) return false
    if (sdk >= 29 && requiredType != 0 && (declaredTypes and requiredType) != requiredType) return false
    if (sdk >= 34 && !hasTypePermission) return false
    return true
  }

  fun canStart(context: Context, service: Class<*>, requiredType: Int, typePermission: String): Boolean =
    runCatching {
      val declared = if (Build.VERSION.SDK_INT >= 29) {
        context.packageManager.getServiceInfo(ComponentName(context, service), 0).foregroundServiceType
      } else {
        0
      }
      allowed(
        sdk = Build.VERSION.SDK_INT,
        hasForegroundPermission = granted(context, FOREGROUND_SERVICE),
        hasTypePermission = granted(context, typePermission),
        declaredTypes = declared,
        requiredType = requiredType,
      )
    }.getOrDefault(false)

  private fun granted(context: Context, permission: String) =
    context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

  const val FOREGROUND_SERVICE = "android.permission.FOREGROUND_SERVICE"
  const val FOREGROUND_SERVICE_MICROPHONE = "android.permission.FOREGROUND_SERVICE_MICROPHONE"
  const val FOREGROUND_SERVICE_REMOTE_MESSAGING = "android.permission.FOREGROUND_SERVICE_REMOTE_MESSAGING"
  const val TYPE_MICROPHONE = 128 // ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
  const val TYPE_REMOTE_MESSAGING = 512 // ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING
}

package com.rakazo.billing

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.browser.auth.AuthTabIntent
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Completes the JS call once the Auth Tab closes, or when the app is back in front. */
object AlmaBillingAuthSession {
  var pending: ((Boolean) -> Unit)? = null
  var activity: Activity? = null

  fun complete(opened: Boolean) {
    val callback = pending
    pending = null
    callback?.invoke(opened)
    activity?.finish()
    activity = null
  }
}

/**
 * Hosts Chrome's Auth Tab. The launcher has to be registered before the activity starts,
 * which a React activity that is already running cannot do.
 */
class AlmaBillingAuthActivity : ComponentActivity() {
  private val launcher: ActivityResultLauncher<Intent> =
    AuthTabIntent.registerActivityResultLauncher(this) { AlmaBillingAuthSession.complete(true) }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    AlmaBillingAuthSession.activity = this
    if (savedInstanceState != null) return
    val url = intent.getStringExtra(EXTRA_URL)
    if (url.isNullOrBlank()) {
      AlmaBillingAuthSession.complete(false)
      return
    }
    try {
      AuthTabIntent.Builder().build().launch(launcher, Uri.parse(url), "rakazo")
    } catch (_: ActivityNotFoundException) {
      AlmaBillingAuthSession.complete(false)
    }
  }

  override fun onDestroy() {
    if (AlmaBillingAuthSession.activity === this) AlmaBillingAuthSession.activity = null
    super.onDestroy()
  }

  companion object {
    const val EXTRA_URL = "url"
  }
}

class AlmaBillingAuthModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AlmaBillingAuth")

    AsyncFunction("open") { url: String, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("ERR_NO_ACTIVITY", "No activity", null)
        return@AsyncFunction
      }
      AlmaBillingAuthSession.pending = { opened ->
        if (opened) promise.resolve(null)
        else promise.reject("ERR_UNAVAILABLE", "Auth Tab unavailable", null)
      }
      activity.startActivity(
        Intent(activity, AlmaBillingAuthActivity::class.java).putExtra(
          AlmaBillingAuthActivity.EXTRA_URL,
          url,
        ),
      )
    }

    OnActivityEntersForeground {
      val current = appContext.currentActivity
      if (current != null && current !is AlmaBillingAuthActivity && AlmaBillingAuthSession.pending != null) {
        AlmaBillingAuthSession.complete(true)
      }
    }
  }
}

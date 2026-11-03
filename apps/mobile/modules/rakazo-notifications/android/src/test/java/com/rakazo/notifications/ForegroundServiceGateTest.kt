package com.rakazo.notifications

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ForegroundServiceGateTest {
  private val mic = ForegroundServiceGate.TYPE_MICROPHONE

  @Test
  fun `stripped Play build never starts a foreground service on modern Android`() {
    for (sdk in listOf(28, 29, 33, 34, 35, 36)) {
      assertFalse(
        "sdk $sdk",
        ForegroundServiceGate.allowed(sdk, hasForegroundPermission = false, hasTypePermission = false, declaredTypes = 0, requiredType = mic),
      )
    }
  }

  @Test
  fun `missing manifest service type blocks the start from Android 10`() {
    assertFalse(ForegroundServiceGate.allowed(29, true, true, declaredTypes = 0, requiredType = mic))
    assertFalse(ForegroundServiceGate.allowed(34, true, true, declaredTypes = ForegroundServiceGate.TYPE_REMOTE_MESSAGING, requiredType = mic))
  }

  @Test
  fun `missing type permission blocks the start from Android 14`() {
    assertFalse(ForegroundServiceGate.allowed(34, true, hasTypePermission = false, declaredTypes = mic, requiredType = mic))
    assertTrue(ForegroundServiceGate.allowed(33, true, hasTypePermission = false, declaredTypes = mic, requiredType = mic))
  }

  @Test
  fun `fully declared service may start`() {
    assertTrue(ForegroundServiceGate.allowed(36, true, true, declaredTypes = mic, requiredType = mic))
    assertTrue(ForegroundServiceGate.allowed(25, false, false, declaredTypes = 0, requiredType = mic))
  }
}

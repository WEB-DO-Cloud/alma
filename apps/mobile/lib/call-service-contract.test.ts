import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UI_LOCALES } from "./ui-locale";

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativeRoot = resolve(mobileRoot, "modules/rakazo-notifications/android/src/main");

function source(path: string) {
  return readFileSync(resolve(nativeRoot, path), "utf8");
}

describe("Android call service", () => {
  it("declares microphone and remote-messaging foreground services", () => {
    const manifest = source("AndroidManifest.xml");
    expect(manifest).toContain('android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE"');
    expect(manifest).toContain(
      'android:name="android.permission.FOREGROUND_SERVICE_REMOTE_MESSAGING"',
    );
    expect(manifest).toContain('android:name="android.permission.FOREGROUND_SERVICE"');
    expect(manifest).not.toContain('tools:node="remove"');
    expect(manifest).toContain("android.permission.WAKE_LOCK");
    expect(manifest).toContain('android:name=".RakazoCallService"');
    expect(manifest).toContain('android:foregroundServiceType="microphone"');
    expect(manifest).toContain('android:name=".RakazoNotificationService"');
    expect(manifest).toContain('android:foregroundServiceType="remoteMessaging"');
  });

  it("starts a microphone foreground service for a call", () => {
    const service = source("java/com/rakazo/notifications/RakazoCallService.kt");
    expect(service).toContain("startForeground");
    expect(service).toContain("FOREGROUND_SERVICE_TYPE_MICROPHONE");
    expect(service).toContain("startForegroundService");
  });

  // The ALMA Play build strips the foreground-service permissions and types
  // (plugins/with-strip-foreground-services.js). Starting a foreground service
  // there throws, and Android then crashes the app as soon as a call opens.
  it("checks the foreground-service permission and type before starting a call service", () => {
    const service = source("java/com/rakazo/notifications/RakazoCallService.kt");
    const gate = source("java/com/rakazo/notifications/ForegroundServiceGate.kt");
    const guard = service.indexOf("ForegroundServiceGate.canStart(");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(service.indexOf("context.startForegroundService(intent)"));
    expect(service).toContain("ForegroundServiceGate.TYPE_MICROPHONE");
    expect(service).toContain("ForegroundServiceGate.FOREGROUND_SERVICE_MICROPHONE");
    expect(gate).toContain('"android.permission.FOREGROUND_SERVICE"');
    expect(gate).toContain("foregroundServiceType");
  });

  it("posts the live notification normally when the foreground service is unavailable", () => {
    const service = source("java/com/rakazo/notifications/RakazoNotificationService.kt");
    expect(service).toContain("ForegroundServiceGate.TYPE_REMOTE_MESSAGING");
    expect(service).toContain("if (!promoted) manager.notify(LIVE_NOTIFICATION_ID, notification)");
  });

  it("provides call strings in every shipped mobile locale", () => {
    const directories = {
      es: "values-es",
      en: "values",
      "zh-CN": "values-zh-rCN",
      "zh-TW": "values-zh-rTW",
      ru: "values-ru",
      de: "values-de",
      nl: "values-nl",
      ja: "values-ja",
    } as const satisfies Record<(typeof UI_LOCALES)[number], string>;
    const keys = ["rakazo_call_channel", "rakazo_call_title", "rakazo_call_text"];
    for (const locale of UI_LOCALES) {
      const xml = source(`res/${directories[locale]}/call_strings.xml`);
      for (const key of keys) expect(xml).toContain(`name="${key}"`);
    }
  });

  // call-card-keep-awake.test.tsx covers the call card starting the service instead of keep-awake.
  it("is exposed to the JS bridge", () => {
    const module = source("java/com/rakazo/notifications/RakazoNotificationsModule.kt");
    expect(module).toContain('AsyncFunction("startCall")');
    expect(module).toContain('AsyncFunction("stopCall")');
  });
});

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
  it("strips microphone and remote-messaging foreground services from the manifest", () => {
    const manifest = source("AndroidManifest.xml");
    expect(manifest).toContain(
      'android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" tools:node="remove"',
    );
    expect(manifest).toContain(
      'android:name="android.permission.FOREGROUND_SERVICE_REMOTE_MESSAGING" tools:node="remove"',
    );
    expect(manifest).toContain(
      'android:name="android.permission.FOREGROUND_SERVICE" tools:node="remove"',
    );
    expect(manifest).toContain("android.permission.WAKE_LOCK");
    expect(manifest).toContain('android:name=".RakazoCallService"');
    expect(manifest).toContain('android:name=".RakazoNotificationService"');
    expect(manifest).toContain('tools:remove="android:foregroundServiceType"');
    expect(manifest).not.toContain("android:foregroundServiceType=");
    expect(manifest).not.toContain('FOREGROUND_SERVICE_MICROPHONE" />');
    expect(manifest).not.toContain('FOREGROUND_SERVICE_REMOTE_MESSAGING" />');
  });

  it("does not start a microphone foreground service", () => {
    const service = source("java/com/rakazo/notifications/RakazoCallService.kt");
    expect(service).not.toContain("startForeground");
    expect(service).not.toContain("FOREGROUND_SERVICE_TYPE_MICROPHONE");
    expect(service).not.toContain("startForegroundService");
    expect(service).toContain("onResult(false)");
    expect(service).toContain("context.stopService");
    expect(service).toContain("runCatching");
  });

  it("provides call strings in every shipped mobile locale", () => {
    const directories = {
      es: "values-es",
      en: "values",
      "zh-CN": "values-zh-rCN",
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

  it("is exposed to the JS bridge and used by the call card instead of keep-awake", () => {
    const module = source("java/com/rakazo/notifications/RakazoNotificationsModule.kt");
    expect(module).toContain('AsyncFunction("startCall")');
    expect(module).toContain('AsyncFunction("stopCall")');
    const callCard = readFileSync(resolve(mobileRoot, "components/CallCard.tsx"), "utf8");
    expect(callCard).toContain("startCallBackground");
    expect(callCard).toContain("stopCallBackground");
    expect(callCard).toContain('Platform.OS !== "android"');
  });
});

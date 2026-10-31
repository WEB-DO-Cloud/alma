import { describe, expect, it } from "vitest";
import { REMOVED_PERMISSIONS, stripForegroundServices } from "./with-strip-foreground-services.js";

describe("stripForegroundServices", () => {
  it("removes foreground-service permissions and service types from the merged manifest", () => {
    const manifest = {
      $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
      "uses-permission": [
        { $: { "android:name": "android.permission.POST_NOTIFICATIONS" } },
        { $: { "android:name": "android.permission.FOREGROUND_SERVICE_MICROPHONE" } },
      ],
      application: [
        {
          $: {},
          service: [
            {
              $: {
                "android:name": "com.rakazo.notifications.RakazoCallService",
                "android:foregroundServiceType": "microphone",
              },
            },
          ],
        },
      ],
    };

    stripForegroundServices(manifest);

    for (const name of REMOVED_PERMISSIONS) {
      const permission = manifest["uses-permission"].find(
        (item) => item.$["android:name"] === name,
      );
      expect(permission?.$["tools:node"]).toBe("remove");
    }
    expect(
      manifest["uses-permission"].find(
        (item) => item.$["android:name"] === "android.permission.POST_NOTIFICATIONS",
      )?.$["tools:node"],
    ).toBeUndefined();

    const services = manifest.application[0].service;
    const call = services.find(
      (item) => item.$["android:name"] === "com.rakazo.notifications.RakazoCallService",
    );
    const notifications = services.find(
      (item) => item.$["android:name"] === "com.rakazo.notifications.RakazoNotificationService",
    );
    expect(call.$["android:foregroundServiceType"]).toBeUndefined();
    expect(call.$["tools:remove"]).toContain("android:foregroundServiceType");
    expect(notifications.$["tools:remove"]).toContain("android:foregroundServiceType");
    expect(notifications.$["android:foregroundServiceType"]).toBeUndefined();
  });

  it("is idempotent", () => {
    const manifest = { $: {}, application: [{ $: {} }] };
    stripForegroundServices(manifest);
    const once = JSON.stringify(manifest);
    stripForegroundServices(manifest);
    expect(JSON.stringify(manifest)).toBe(once);
  });
});

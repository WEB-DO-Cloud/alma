const { withAndroidManifest } = require("expo/config-plugins");

const TOOLS_NS = "http://schemas.android.com/tools";

/** Play requires a video for every foreground-service type. v1 ships without these. */
const REMOVED_PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MICROPHONE",
  "android.permission.FOREGROUND_SERVICE_REMOTE_MESSAGING",
];

const SERVICE_NAMES = [
  "com.rakazo.notifications.RakazoCallService",
  "com.rakazo.notifications.RakazoNotificationService",
];

function mergeToolsRemove(current, attribute) {
  const parts = new Set(
    String(current ?? "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  );
  parts.add(attribute);
  return [...parts].join(",");
}

/**
 * Highest-priority manifest markers. Library manifests are merged later, so
 * `tools:node="remove"` has to live on the app manifest to win.
 */
function stripForegroundServices(manifest) {
  manifest.$ = { ...(manifest.$ ?? {}), "xmlns:tools": TOOLS_NS };
  const permissions = manifest["uses-permission"] ?? [];
  for (const name of REMOVED_PERMISSIONS) {
    const existing = permissions.find((item) => item.$?.["android:name"] === name);
    if (existing) {
      existing.$["tools:node"] = "remove";
    } else {
      permissions.push({ $: { "android:name": name, "tools:node": "remove" } });
    }
  }
  manifest["uses-permission"] = permissions;

  const application = manifest.application?.[0];
  if (!application) return manifest;
  const services = application.service ?? [];
  for (const name of SERVICE_NAMES) {
    let service = services.find((item) => item.$?.["android:name"] === name);
    if (!service) {
      service = { $: { "android:name": name, "android:exported": "false" } };
      services.push(service);
    }
    delete service.$["android:foregroundServiceType"];
    service.$["tools:remove"] = mergeToolsRemove(
      service.$["tools:remove"],
      "android:foregroundServiceType",
    );
  }
  application.service = services;
  return manifest;
}

function withStripForegroundServices(config) {
  return withAndroidManifest(config, (cfg) => {
    stripForegroundServices(cfg.modResults.manifest);
    return cfg;
  });
}

module.exports = withStripForegroundServices;
module.exports.stripForegroundServices = stripForegroundServices;
module.exports.REMOVED_PERMISSIONS = REMOVED_PERMISSIONS;

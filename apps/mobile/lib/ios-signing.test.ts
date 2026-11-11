import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mobile = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const read = (path: string) => readFileSync(join(mobile, path), "utf8");

const GROUP = "group.do.alma.app";
const UPSTREAM_GROUP = "group.com.rakazo.app";

type ExpoConfig = {
  name: string;
  plugins: unknown[];
  ios: { bundleIdentifier: string; entitlements: Record<string, unknown> };
  extra: {
    eas: {
      build: {
        experimental: {
          ios: {
            appExtensions: Array<{
              targetName: string;
              bundleIdentifier: string;
              entitlements?: Record<string, unknown>;
            }>;
          };
        };
      };
    };
  };
};

function expoConfig(): ExpoConfig {
  return JSON.parse(read("app.json")).expo as ExpoConfig;
}

function signedTargets(fastfile: string) {
  const block = fastfile.match(/SIGNED_TARGETS = \[([\s\S]*?)\]\.freeze/);
  expect(block, "SIGNED_TARGETS").toBeTruthy();
  const pairs = [...block![1]!.matchAll(/target: "([^"]+)", bundle_id: "([^"]+)"/g)];
  return pairs.map((match) => ({ target: match[1]!, bundleId: match[2]! }));
}

function sharingIos(config: ExpoConfig) {
  const entry = config.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-sharing",
  );
  expect(entry).toBeTruthy();
  const ios = (
    entry as [string, { ios: { appGroupId?: string; extensionBundleIdentifier?: string } }]
  )[1].ios;
  return ios;
}

describe("iOS signing targets", () => {
  const fastfile = read("fastlane/Fastfile");
  const matchfile = read("fastlane/Matchfile");
  const targets = signedTargets(fastfile);

  it("uses the ALMA app group for the share producer and the JavaScript consumer", () => {
    const app = expoConfig();
    const sharing = sharingIos(app);
    expect(sharing.appGroupId).toBe(GROUP);
    expect(sharing.extensionBundleIdentifier).toBe("do.alma.app.expo-sharing-extension");
    expect(app.ios.entitlements["com.apple.security.application-groups"]).toEqual([GROUP]);
    expect(read("lib/incoming-share.ts")).toContain(
      `export const IOS_SHARE_APP_GROUP = "${GROUP}";`,
    );
    for (const path of [
      "app.json",
      "fastlane/Fastfile",
      "fastlane/Matchfile",
      "lib/incoming-share.ts",
    ]) {
      expect(read(path), path).not.toContain(UPSTREAM_GROUP);
    }
  });

  it("keeps extension bundle ids and does not add an app group to widgets or notifications", () => {
    const app = expoConfig();
    const extensions = app.extra.eas.build.experimental.ios.appExtensions;
    expect(targets).toEqual([
      { target: app.name, bundleId: app.ios.bundleIdentifier },
      ...extensions.map((extension) => ({
        target: extension.targetName,
        bundleId: extension.bundleIdentifier,
      })),
    ]);
    expect(extensions.map((extension) => extension.bundleIdentifier)).toEqual([
      "do.alma.app.widgets",
      "do.alma.app.expo-sharing-extension",
      "do.alma.app.notifications",
    ]);
    const byName = new Map(extensions.map((extension) => [extension.targetName, extension]));
    expect(byName.get("RakazoWidgets")?.entitlements).toBeUndefined();
    expect(byName.get("expo-sharing-extension")?.entitlements).toEqual({
      "com.apple.security.application-groups": [GROUP],
    });
    expect(byName.get("AgentNotifications")?.entitlements).toEqual({
      "com.apple.developer.usernotifications.communication": true,
    });
  });

  it("asks match for the same App Store ids and signs each target with its profile", () => {
    const block = matchfile.match(/app_identifier\(\[([\s\S]*?)\]\)/);
    expect(block).toBeTruthy();
    const ids = [...block![1]!.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual(targets.map((target) => target.bundleId));
    const signing = fastfile.slice(
      fastfile.indexOf("def use_match_signing!"),
      fastfile.indexOf("def ios_workspace"),
    );
    expect(signing).toContain("SIGNED_TARGETS.each");
    expect(signing).toContain("use_automatic_signing: false");
    expect(signing).toContain("team_id: team");
    expect(signing).toContain("profile_name: profile");
    expect(signing).toContain("profiles[identifier] = profile");
    expect(fastfile).toContain("export_options[:provisioningProfiles] = use_match_signing!");
    expect(fastfile).toContain('ENV["APPLE_TEAM_ID"]');
    expect(fastfile).not.toMatch(/team_id:\s*"/);
    expect(fastfile).toContain('DEVELOPMENT_TARGETS = ["ALMA", "RakazoWidgets"].freeze');
    expect(fastfile).toContain("app_identifier: match_identifiers(type)");
    for (const name of readdirSync(join(mobile, "plugins"))) {
      if (!name.endsWith(".js") || name.endsWith(".test.js")) continue;
      expect(read(`plugins/${name}`), name).not.toContain("DEVELOPMENT_TEAM");
    }
  });

  it("lets expo-sharing add the ALMA group without keeping the upstream group", () => {
    const { withConfig } = require("expo-sharing/plugin/build/withConfig.js") as {
      withConfig: (
        config: ExpoConfig,
        props: { bundleIdentifier: string; targetName: string; groupIdentifier: string },
      ) => ExpoConfig;
    };
    const config = structuredClone(expoConfig());
    const result = withConfig(config, {
      bundleIdentifier: "do.alma.app.expo-sharing-extension",
      targetName: "expo-sharing-extension",
      groupIdentifier: sharingIos(config).appGroupId ?? "",
    });
    expect(result.ios.entitlements["com.apple.security.application-groups"]).toEqual([GROUP]);
    const share = result.extra.eas.build.experimental.ios.appExtensions.find(
      (extension) => extension.targetName === "expo-sharing-extension",
    );
    expect(share?.entitlements?.["com.apple.security.application-groups"]).toEqual([GROUP]);
    const notifications = result.extra.eas.build.experimental.ios.appExtensions.find(
      (extension) => extension.targetName === "AgentNotifications",
    );
    expect(notifications?.entitlements).toEqual({
      "com.apple.developer.usernotifications.communication": true,
    });
    expect(JSON.stringify(result)).not.toContain(UPSTREAM_GROUP);
  });
});

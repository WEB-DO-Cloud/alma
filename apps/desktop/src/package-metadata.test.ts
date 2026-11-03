import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../package.json"), "utf8"),
) as {
  productName?: string;
  build?: {
    productName?: string;
    mac?: {
      extendInfo?: Record<string, string>;
      extraResources?: { from: string; to: string }[];
    };
  };
};

describe("desktop package metadata", () => {
  it("shares the customer-facing name between Electron and electron-builder", () => {
    expect(packageJson.productName).toBe("ALMA");
    expect(packageJson.build?.productName).toBeUndefined();
  });

  it("publishes as do.alma.desktop with stable release asset names", () => {
    const build = JSON.parse(
      readFileSync(path.resolve(import.meta.dirname, "../package.json"), "utf8"),
    ) as {
      build: {
        appId: string;
        mac: { artifactName: string };
        dmg: { artifactName: string };
        nsis: { artifactName: string };
        linux: { artifactName: string; executableName: string };
        extraMetadata: { name: string };
      };
    };
    expect(build.build.appId).toBe("do.alma.desktop");
    expect(build.build.mac.artifactName).toBe("ALMA-mac.${ext}");
    expect(build.build.dmg.artifactName).toBe("ALMA-mac.${ext}");
    expect(build.build.nsis.artifactName).toBe("ALMA-Setup.${ext}");
    expect(build.build.linux.artifactName).toBe("ALMA-linux.${ext}");
    expect(build.build.linux.executableName).toBe("rakazo");
    expect(build.build.extraMetadata.name).toBe("rakazo");
  });

  it("links the homepage at the stable GitHub release assets and does not fetch them", () => {
    const root = path.resolve(import.meta.dirname, "../../..");
    const site = readFileSync(path.join(root, "apps/www/src/site.ts"), "utf8");
    const actions = readFileSync(
      path.join(root, "apps/www/src/components/GetStartedActions.astro"),
      "utf8",
    );
    const home = readFileSync(path.join(root, "apps/www/src/i18n/home.ts"), "utf8");
    for (const name of ["ALMA-mac.dmg", "ALMA-Setup.exe", "ALMA-linux.AppImage"]) {
      const url = `https://github.com/WEB-DO-Cloud/alma/releases/latest/download/${name}`;
      expect(site).toContain(url);
      expect(actions).toContain("DESKTOP_DOWNLOADS");
    }
    expect(actions).not.toContain("api.github.com");
    expect(home).toContain("If the download does not start, the desktop app is not published yet.");
    expect(home).toContain(
      "Windows may say it does not recognize this installer. It is not signed yet.",
    );
    expect(home).toContain(
      "Si la descarga no empieza, la app de escritorio todavía no está publicada.",
    );
  });

  it("ships a Spanish version of every macOS permission prompt", () => {
    const strings = readFileSync(
      path.resolve(import.meta.dirname, "../assets/es.lproj/InfoPlist.strings"),
      "utf8",
    );
    const prompts = Object.keys(packageJson.build?.mac?.extendInfo ?? {}).filter((key) =>
      key.endsWith("UsageDescription"),
    );
    expect(prompts.length).toBeGreaterThan(0);
    for (const key of prompts) expect(strings, key).toMatch(new RegExp(`^"${key}" = ".+";$`, "m"));
    expect(packageJson.build?.mac?.extraResources).toContainEqual({
      from: "assets/es.lproj",
      to: "es.lproj",
    });
  });
});

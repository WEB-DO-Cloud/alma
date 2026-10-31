import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const { fixAndroidNamespace } = createRequire(import.meta.url)(
  "../scripts/fix-android-namespace.mjs",
) as { fixAndroidNamespace: (root: string) => void };

const gradle = `android {
    namespace 'do.alma.app'
    defaultConfig {
        applicationId 'do.alma.app'
    }
}
`;

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tree() {
  const root = mkdtempSync(join(tmpdir(), "alma-android-"));
  roots.push(root);
  mkdirSync(join(root, "app/src/main/java/do/alma/app"), { recursive: true });
  writeFileSync(join(root, "app/build.gradle"), gradle);
  writeFileSync(
    join(root, "app/src/main/java/do/alma/app/MainActivity.kt"),
    "package do.alma.app\n\nclass MainActivity\n",
  );
  writeFileSync(
    join(root, "app/src/main/AndroidManifest.xml"),
    '<manifest>\n  <activity android:name=".MainActivity" />\n</manifest>\n',
  );
  return root;
}

describe("Android namespace", () => {
  it("moves the reserved package and keeps the Play application id", () => {
    const root = tree();
    fixAndroidNamespace(root);

    const next = readFileSync(join(root, "app/build.gradle"), "utf8");
    expect(next).toContain("namespace 'app.alma'");
    expect(next).toContain("applicationId 'do.alma.app'");
    expect(next).not.toContain("namespace 'do.alma.app'");
    expect(readFileSync(join(root, "app/src/main/java/app/alma/MainActivity.kt"), "utf8")).toBe(
      "package app.alma\n\nclass MainActivity\n",
    );
    expect(readFileSync(join(root, "app/src/main/AndroidManifest.xml"), "utf8")).toContain(
      'android:name=".MainActivity"',
    );

    fixAndroidNamespace(root);
    expect(readFileSync(join(root, "app/build.gradle"), "utf8")).toContain(
      "applicationId 'do.alma.app'",
    );
  });

  it("refuses a missing namespace and an existing destination", () => {
    const missing = tree();
    writeFileSync(join(missing, "app/build.gradle"), "android {\n    namespace 'com.other'\n}\n");
    expect(() => fixAndroidNamespace(missing)).toThrow(/namespace do\.alma\.app not found/);

    const occupied = tree();
    mkdirSync(join(occupied, "app/src/main/java/app/alma"), { recursive: true });
    expect(() => fixAndroidNamespace(occupied)).toThrow(/Refusing to overwrite/);
  });
});

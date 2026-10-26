#!/usr/bin/env bash
# Generate the Android project for a preview APK. Does not change app source.
# Sample mode is left to the caller's environment. This script does not force it on.
set -euo pipefail

pnpm --filter @rakazo/mobile exec expo prebuild --platform android --no-install
sed -i 's/MaxMetaspaceSize=512m/MaxMetaspaceSize=1g/' \
  apps/mobile/android/gradle.properties
sed -i 's/-Xmx2048m/-Xmx4g/' apps/mobile/android/gradle.properties
if grep -q '^reactNativeArchitectures=' apps/mobile/android/gradle.properties; then
  sed -i 's/^reactNativeArchitectures=.*/reactNativeArchitectures=arm64-v8a,x86_64/' \
    apps/mobile/android/gradle.properties
else
  echo 'reactNativeArchitectures=arm64-v8a,x86_64' >> apps/mobile/android/gradle.properties
fi

python3 - <<'PY'
import re
import shutil
from pathlib import Path

root = Path("apps/mobile/android")
gradle_path = root / "app/build.gradle"
text = gradle_path.read_text()
text = text.replace(
    "signingConfig signingConfigs.release",
    "signingConfig signingConfigs.debug",
)
text, namespace_edits = re.subn(
    r"namespace\s+['\"]do\.alma\.app['\"]",
    "namespace 'app.alma'",
    text,
)
if namespace_edits != 1:
    raise SystemExit(f"Expected one namespace edit, found {namespace_edits}")
if "applicationId 'do.alma.app'" not in text and 'applicationId "do.alma.app"' not in text:
    raise SystemExit("applicationId do.alma.app was not kept")
if "signingConfig signingConfigs.debug" not in text:
    raise SystemExit("Generated Gradle project has no debug signing config")
gradle_path.write_text(text)

src = root / "app/src"
for path in src.rglob("*"):
    if path.is_file() and path.suffix in {".kt", ".java", ".xml"}:
        body = path.read_text()
        updated = body.replace("do.alma.app", "app.alma")
        if updated != body:
            path.write_text(updated)
for package_dir in list(src.rglob("do")):
    sources = package_dir / "alma" / "app"
    if not sources.is_dir():
        continue
    dest = package_dir.parent / "app" / "alma"
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        raise SystemExit(f"Refusing to overwrite {dest}")
    shutil.move(str(sources), str(dest))
    alma_dir = package_dir / "alma"
    if alma_dir.exists() and not any(alma_dir.iterdir()):
        alma_dir.rmdir()
    if package_dir.exists() and not any(package_dir.iterdir()):
        package_dir.rmdir()
print("Release build uses the debug keystore and namespace app.alma")

mobile = Path("apps/mobile")
shim = mobile / ".preview-node-module.js"
shim.write_text(
    "function createRequire() {\n"
    "  return function previewRequire(id) {\n"
    "    if (String(id).includes('sentry-upload')) {\n"
    "      return { sentryUploadAllowed: function () { return false; } };\n"
    "    }\n"
    "    throw new Error('Unsupported Node built-in in the preview bundle: ' + id);\n"
    "  };\n"
    "}\n"
    "module.exports = { createRequire };\n"
)
metro = mobile / "metro.config.js"
metro_text = metro.read_text()
needle = "config.resolver.resolveRequest = (context, moduleName, platform) => {"
insert = (
    needle
    + "\n  if (moduleName === \"node:module\") {\n"
    + "    return { type: \"sourceFile\", filePath: require(\"path\").join(projectRoot, \".preview-node-module.js\") };\n"
    + "  }\n"
)
if needle not in metro_text:
    raise SystemExit("metro resolver hook not found")
if 'moduleName === "node:module"' not in metro_text:
    metro.write_text(metro_text.replace(needle, insert, 1))
print("preview bundle can resolve node:module")

mock = (mobile / "lib" / "alma-mock.ts").read_text()
if mock.count("  return mockModeFromEnv();\n") != 1:
    raise SystemExit("sample-mode patch is present; this APK must keep the env check")
print("sample mode follows the environment")
PY

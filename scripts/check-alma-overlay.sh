#!/usr/bin/env bash
# Fails when the ALMA overlay drifts from the rules in
# docs/designs/alma-upstream-sync-2026-11.md
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"

fail() { echo "alma-overlay: $1" >&2; exit 1; }

python3 - << 'PY'
import json, pathlib, re, sys
app = json.loads(pathlib.Path("apps/mobile/app.json").read_text())
expo = app["expo"]
def ver(value):
    parts = [int(p) for p in str(value).split(".")]
    return parts
if ver(expo["version"]) < [1, 0, 12]:
    sys.exit(f"expo.version is {expo['version']}, expected at least 1.0.12")
if int(expo["ios"]["buildNumber"]) < 66:
    sys.exit(f"ios.buildNumber is {expo['ios']['buildNumber']}, expected at least 66")
if int(expo["android"]["versionCode"]) < 14:
    sys.exit(f"android.versionCode is {expo['android']['versionCode']}, expected at least 14")
domain = pathlib.Path("packages/contracts/src/domain.ts").read_text()
if "BYOK_MONTHLY_PRICE_CENTS: number | null = 5900" not in domain:
    sys.exit("BYOK_MONTHLY_PRICE_CENTS is not 5900")
thread = pathlib.Path("apps/mobile/app/thread.tsx").read_text()
layout = pathlib.Path("apps/mobile/app/_layout.tsx").read_text()
if re.search(r"\bDictat", thread) or re.search(r"\bDictat", layout):
    sys.exit("phone composer still has a Dictate control")
if "sample-data" in layout or "sampleData" in layout:
    sys.exit("sample-data mode is referenced from the phone home screen")
account = pathlib.Path("apps/mobile/app/(settings)/account.tsx").read_text()
if 'href: "/models"' in account or 'href: "/voice"' in account:
    sys.exit("account settings still link to Models or Voice")
nav = pathlib.Path("apps/web/src/pages/settings-nav.ts").read_text()
if 'id: "models"' in nav or 'id: "voice"' in nav:
    sys.exit("web settings nav still offers Models or Voice")
absent = [
    "apps/web/src/pages/DraftReview.tsx",
    "apps/web/src/pages/DraftApprovalLog.tsx",
    "apps/web/src/pages/OrganizationSettingsPanel.tsx",
    "apps/api/src/routes/drafts.ts",
    "apps/api/src/routes/organization.ts",
    "packages/contracts/src/draft-review.ts",
    "packages/contracts/src/organization-settings.ts",
    "packages/core/src/mcp-registry.ts",
    "packages/core/src/mcp-registry.test.ts",
    "packages/core/src/mcp-registry-featured.ts",
    "packages/core/src/mcp-registry-icons.ts",
    "apps/api/src/mcp-registry.ts",
    "apps/api/src/mcp-registry.test.ts",
    "apps/web/src/components/integrations/McpRegistryBrowse.tsx",
    "apps/web/src/components/integrations/McpRegistryBrowse.test.tsx",
    "apps/web/src/lib/add-remote-mcp.ts",
    "apps/mobile/components/mcp-registry-browse.tsx",
    "apps/web/e2e/alma-overlay-shots.spec.ts",
    "docs/designs/alma-mcp-registry.md",
]
for path in absent:
    if pathlib.Path(path).exists():
        sys.exit(f"{path} is back; draft review, organization settings, and the MCP registry layer stay out")
schema = pathlib.Path("packages/db/prisma/schema.prisma").read_text()
for model in ("OrganizationProfile", "ReviewDraft", "DraftApprovalLog"):
    if f"model {model} " in schema:
        sys.exit(f"schema still has {model}")
kept = [
    "packages/db/prisma/migrations/20261026120000_organization_settings/migration.sql",
    "packages/db/prisma/migrations/20261026140000_draft_approval/migration.sql",
    "packages/db/prisma/migrations/20261031120000_message_reports/migration.sql",
]
for path in kept:
    if not pathlib.Path(path).is_file():
        sys.exit(f"missing shipped migration {path}; do not delete history that production already applied")
server = pathlib.Path("apps/mobile/lib/server-config.ts").read_text()
if 'PRODUCTION_API = "https://app.alma.com.do"' not in server:
    sys.exit("mobile production API is not https://app.alma.com.do")
if "DEFAULT_API = configuredApi ? configuredApi : PRODUCTION_API" not in server:
    sys.exit("mobile default API does not fall back to the production server")
if '"https://app.alma.com.do"' not in pathlib.Path("apps/mobile/plugins/with-app-intents.js").read_text():
    sys.exit("iOS shortcut fallback server is not the production API")
if '"EXPO_PUBLIC_API_URL": "https://app.alma.com.do"' not in pathlib.Path("apps/mobile/eas.json").read_text():
    sys.exit("EAS production profile does not set the production API")
if 'RAKAZO_CLOUD_URL = "https://app.alma.com.do"' not in pathlib.Path("apps/desktop/src/setup-config.ts").read_text():
    sys.exit("desktop cloud URL is not the production API")
if 'OFFICIAL_REPO_URL = "https://github.com/WEB-DO-Cloud/alma"' not in pathlib.Path("packages/core/src/self-update.ts").read_text():
    sys.exit("update repository is not the ALMA repo")
if 'PUBLISHED_IMAGE_REPO = "web-do-cloud/alma"' not in pathlib.Path("packages/core/src/compose-update.ts").read_text():
    sys.exit("published image repository is not the ALMA repo")
if "export const SUBMIT_PLUGIN_URL: string | null = null" not in domain:
    sys.exit("plugin submit URL is set; Integrations must hide Submit a plugin")
web_integrations = pathlib.Path("apps/web/src/pages/PluginsOverlay.tsx").read_text()
phone_integrations = pathlib.Path("apps/mobile/app/(settings)/integrations.tsx").read_text()
if "SUBMIT_PLUGIN_URL ?" not in web_integrations:
    sys.exit("web Integrations always shows Submit a plugin")
if "SUBMIT_PLUGIN_URL ?" not in phone_integrations:
    sys.exit("mobile Integrations always shows Submit a plugin")
skills_text = pathlib.Path("packages/adapters/src/builtin-skills.ts").read_text()
if "https://app.alma.com.do" not in skills_text or "/docs.md" not in skills_text or "self-host" in skills_text:
    sys.exit("help skill must use app.alma.com.do docs and omit self-host pages")
if 'href="https://app.alma.com.do/docs"' not in pathlib.Path("apps/web/src/components/SidebarFooter.tsx").read_text():
    sys.exit("sidebar Docs link is not the app docs")
mic = pathlib.Path("apps/mobile/locales/es.json").read_text()
if "ALMA usa el micrófono para dictar y para llamadas de voz." not in mic:
    sys.exit("Spanish microphone purpose is missing")
if "ALMA uses the microphone for dictation and voice calls." not in pathlib.Path("apps/mobile/app.json").read_text():
    sys.exit("English microphone purpose is missing")
manifest_xml = pathlib.Path("apps/mobile/modules/rakazo-notifications/android/src/main/AndroidManifest.xml").read_text()
if 'android:foregroundServiceType="microphone"' not in manifest_xml:
    sys.exit("Android call service is missing the microphone foreground type")
# 1.0.13 ships without foreground services until the Play declaration and demo video are done.
if "with-strip-foreground-services" not in pathlib.Path("apps/mobile/app.json").read_text():
    sys.exit("foreground-service strip plugin is not registered")
if 'tools:node="remove"' in manifest_xml and "FOREGROUND_SERVICE" in manifest_xml:
    sys.exit("Android foreground service permissions are still stripped")
skills = pathlib.Path("packages/adapters/src/builtin-skills.ts").read_text()
if "rakazo.com" in skills or "github.com/elie222" in skills:
    sys.exit("built-in skill docs still point at a Rakazo host")
banned_hosts = ("rakazo.com", "app.rakazo.com", "github.com/elie222", "ghcr.io/elie222")
host_files = [
    "apps/mobile/lib/server-config.ts",
    "apps/mobile/plugins/with-app-intents.js",
    "apps/mobile/app.config.ts",
    "apps/mobile/eas.json",
    "apps/desktop/src/setup-config.ts",
    "apps/desktop/package.json",
    "packages/core/src/self-update.ts",
    "packages/core/src/compose-update.ts",
    "packages/contracts/src/domain.ts",
    "packages/adapters/src/builtin-skills.ts",
    "packages/adapters/src/kubernetes-sandbox.ts",
    "infra/compose/install-images.sh",
    "infra/compose/docker-compose.prod.yml",
    ".github/workflows/ci.yml",
    "apps/www/src/site.ts",
]
for path in host_files:
    text = pathlib.Path(path).read_text()
    for needle in banned_hosts:
        if needle in text:
            sys.exit(f"{path} still mentions {needle}")
if "Rakazo" in pathlib.Path("apps/mobile/locales/es.json").read_text():
    sys.exit("Spanish permission strings still say Rakazo")
for xml in pathlib.Path("apps/mobile/modules").rglob("call_strings.xml"):
    for match in re.findall(r">([^<]*Rakazo[^<]*)<", xml.read_text()):
        sys.exit(f"{xml} shows {match}")
intents = pathlib.Path("apps/mobile/ios-intents/RakazoIntents.swift").read_text()
for phrase in (" in Rakazo", " to Rakazo", "Open Rakazo"):
    if phrase in intents:
        sys.exit(f"iOS shortcuts still say {phrase.strip()}")
PY

if ! git rev-parse --verify upstream/main >/dev/null 2>&1; then
  echo "alma-overlay: upstream/main is not fetched; skipping the path allowlist"
  exit 0
fi

manifest=scripts/alma-overlay-manifest.txt
if [[ ! -f $manifest ]]; then
  fail "missing $manifest"
fi

globs=(
  'apps/www/public/integrations/'
  'apps/web/src/locales/'
  'apps/web/scripts/translations-'
  'apps/mobile/lib/locales/'
  'pnpm-lock.yaml'
  'docs/designs/alma-upstream-sync-2026-11.md'
  'docs/designs/reviews/2026-11-02-alma-upstream-sync.md'
  'docs/designs/reviews/2026-11-02-alma-upstream-sync-drift.md'
  'scripts/sync-upstream.sh'
  'scripts/alma-overlay-manifest.txt'
  'scripts/check-alma-overlay.sh'
)

allowed=$(mktemp)
while IFS= read -r line; do
  path=${line#* }
  [[ -n $path && $path != \#* ]] && echo "$path" >> "$allowed"
done < "$manifest"
sort -u -o "$allowed" "$allowed"

diff_names=$(mktemp)
git diff --name-only upstream/main > "$diff_names" || true
while IFS= read -r path; do
  [[ -z $path ]] && continue
  if grep -Fxq "$path" "$allowed"; then
    continue
  fi
  ok=0
  for glob in "${globs[@]}"; do
    if [[ $path == $glob* || $path == "$glob" ]]; then
      ok=1
      break
    fi
  done
  if [[ $ok -eq 0 ]]; then
    echo "alma-overlay: $path differs from upstream and is not in the manifest" >&2
    fail "path allowlist"
  fi
done < "$diff_names"

# Product surfaces. Identifiers that stay spelled Rakazo are allowlisted.
python3 - << 'PY'
import pathlib, re, sys
roots = ["apps/web/src", "apps/mobile/app", "apps/mobile/lib/locales", "apps/www/src"]
files = []
for root in roots:
    files.extend(pathlib.Path(root).rglob("*"))
files.append(pathlib.Path("README.md"))
allow = re.compile(
    r"@rakazo|rakazo://|RAKAZO_|com\.rakazo|Rakazo\.icon|RakazoDesktop|rakazoDesktop|docs/designs/|from \"@rakazo|LICENSE"
)
bad = []
for path in files:
    if not path.is_file():
        continue
    if path.suffix not in {".ts", ".tsx", ".astro", ".po", ".md", ".json"}:
        continue
    if ".test." in path.name or path.name.endswith(".spec.ts") or path.name.endswith(".spec.tsx"):
        continue
    for i, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        if "Rakazo" not in line:
            continue
        if allow.search(line):
            continue
        bad.append(f"{path}:{i}:{line.strip()[:160]}")
if bad:
    print("\n".join(bad[:40]), file=sys.stderr)
    sys.exit(f"{len(bad)} Rakazo product strings outside the allowlist")
PY

python3 - << 'PY'
import pathlib, subprocess, sys
banned = ("rakazo-public", "your-objectstorage.com")
allow = {
    "scripts/sync-integrations-catalog.py",
    "scripts/check-alma-overlay.sh",
}
files = subprocess.check_output(["git", "ls-files"], text=True).splitlines()
extra = pathlib.Path("apps/www/public/integrations")
if extra.exists():
    files.extend(str(path) for path in extra.rglob("*") if path.is_file())
loader = pathlib.Path("apps/www/src/integrations.ts").read_text()
if "process.env.CATALOG_URL" not in loader or "public/integrations/catalog.json" not in loader:
    sys.exit("marketing catalog default is not the committed snapshot with a CATALOG_URL override")
seen = set()
bad = []
for path in files:
    if path in seen or path in allow:
        continue
    seen.add(path)
    file = pathlib.Path(path)
    if not file.is_file():
        continue
    if file.suffix.lower() in {".png", ".jpg", ".jpeg", ".ico", ".webp", ".gif"}:
        continue
    try:
        text = file.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue
    for needle in banned:
        if needle in text:
            bad.append(f"{path} mentions {needle}")
            break
if bad:
    print("\n".join(bad[:40]), file=sys.stderr)
    sys.exit(f"{len(bad)} files still name a Rakazo object-storage host")
PY

echo "alma-overlay: ok"

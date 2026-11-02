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
if ver(expo["version"]) != [1, 0, 12]:
    sys.exit(f"expo.version is {expo['version']}, expected 1.0.12")
if int(expo["ios"]["buildNumber"]) != 64:
    sys.exit(f"ios.buildNumber is {expo['ios']['buildNumber']}, expected 64")
if int(expo["android"]["versionCode"]) != 13:
    sys.exit(f"android.versionCode is {expo['android']['versionCode']}, expected 13")
domain = pathlib.Path("packages/contracts/src/domain.ts").read_text()
if "BYOK_MONTHLY_PRICE_CENTS: number | null = 6900" not in domain:
    sys.exit("BYOK_MONTHLY_PRICE_CENTS is not 6900")
thread = pathlib.Path("apps/mobile/app/thread.tsx").read_text()
layout = pathlib.Path("apps/mobile/app/_layout.tsx").read_text()
if re.search(r"\bDictat", thread) or re.search(r"\bDictat", layout):
    sys.exit("phone composer still has a Dictate control")
if "sample-data" in layout or "sampleData" in layout:
    sys.exit("sample-data mode is referenced from the phone home screen")
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

echo "alma-overlay: ok"

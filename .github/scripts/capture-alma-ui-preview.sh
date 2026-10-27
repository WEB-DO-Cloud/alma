#!/usr/bin/env bash
# Install the sample-mode APK on the booted emulator and capture ALMA screens.
# A tiny capabilities server lets the sign-in form render after sample mode is turned off.
set -euo pipefail

report_dir="test-report/alma-ui-preview"
shot_dir="${report_dir}/screenshots"
apk="apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
run_log="${RUNNER_TEMP:?}/alma-ui-preview.log"
android_log="${RUNNER_TEMP:?}/alma-ui-preview-android.log"
android_log_pid=""
stub_pid=""

mkdir -p "$report_dir" "$shot_dir"
exec > >(tee "$run_log") 2>&1

cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "$android_log_pid" ]]; then
    kill "$android_log_pid" 2>/dev/null || true
  fi
  if [[ -n "$stub_pid" ]]; then
    kill "$stub_pid" 2>/dev/null || true
  fi
  cp "$android_log" "$report_dir/android.log" 2>/dev/null || true
  cp "$run_log" "$report_dir/run.log" 2>/dev/null || true
  python3 - <<'PY' || true
import os
import shutil
roots = ["test-report/alma-ui-preview", os.path.expanduser("~/.maestro")]
dest = "test-report/alma-ui-preview/screenshots"
os.makedirs(dest, exist_ok=True)
seen = set()
for root in roots:
    if not os.path.isdir(root):
        continue
    for dirpath, _dirs, files in os.walk(root):
        if os.path.abspath(dirpath) == os.path.abspath(dest):
            continue
        for name in files:
            if not name.endswith(".png"):
                continue
            src = os.path.join(dirpath, name)
            target = os.path.join(dest, name)
            if name in seen:
                target = os.path.join(dest, f"{len(seen)}-{name}")
            shutil.copy2(src, target)
            seen.add(name)
print("copied", len(seen), "pngs")
PY
  echo "Screenshots:"
  find "$shot_dir" -name '*.png' -print | sort || true
  if [[ "$status" -eq 0 ]]; then
    local count
    count="$(find "$shot_dir" -name '*.png' | wc -l | tr -d ' ')"
    if [[ "${count}" -lt 10 ]]; then
      echo "Expected the ALMA screenshots, found ${count}" >&2
      status=1
    fi
  fi
  exit "$status"
}
trap cleanup EXIT

if [[ ! -f "$apk" ]]; then
  echo "Missing sample-mode APK at $apk" >&2
  exit 1
fi

python3 - <<'PY' &
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json

CAPABILITIES = {
    "sso": None,
    "passwordAuth": True,
    "passwordReset": True,
    "resetUrl": "http://10.0.2.2:3110/reset-password",
    "emailCode": False,
    "billing": False,
    "passkeyRpId": None,
    "nativePasskeys": {"ios": False, "android": False},
}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("access-control-allow-origin", "*")
        self.send_header("cache-control", "no-store")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith("/api/auth/capabilities"):
            self._send(200, CAPABILITIES)
            return
        self._send(404, {"json": {"message": "Not available in the preview", "code": "NOT_FOUND"}})

    def do_POST(self):
        length = int(self.headers.get("content-length", "0") or "0")
        if length:
            self.rfile.read(length)
        self.do_GET()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET, POST, OPTIONS")
        self.send_header("access-control-allow-headers", "*")
        self.end_headers()

    def log_message(self, fmt, *args):
        print("[capabilities]", self.address_string(), fmt % args)


ThreadingHTTPServer(("0.0.0.0", 3110), Handler).serve_forever()
PY
stub_pid=$!

ready=0
for _ in $(seq 1 40); do
  if python3 -c 'import urllib.request; urllib.request.urlopen("http://127.0.0.1:3110/api/auth/capabilities", timeout=1).read()' >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.25
done
if [[ "$ready" != "1" ]]; then
  echo "Sign-in capabilities stub did not start" >&2
  exit 1
fi

adb install -r -d "$apk"
adb shell pm grant do.alma.app android.permission.RECORD_AUDIO || true
adb logcat -c
adb logcat > "$android_log" &
android_log_pid=$!

maestro_bin="${HOME}/.maestro/bin/maestro"
if [[ ! -x "$maestro_bin" ]]; then
  maestro_bin="$(command -v maestro)"
fi

timeout --signal=INT --kill-after=30s 25m \
  "$maestro_bin" test \
  --no-ansi \
  --flatten-debug-output \
  --debug-output "${report_dir}/debug" \
  --test-output-dir "${report_dir}/maestro" \
  --format HTML \
  --output "${report_dir}/alma-screenshots.html" \
  apps/mobile/.maestro/alma-screenshots.yaml

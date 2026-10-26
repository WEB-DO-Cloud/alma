#!/usr/bin/env bash
# Install the real ALMA app APK and record the signed-out screen.
# Cloudflare Access may block the capabilities request. The screenshot is the result.
set -euo pipefail

report_dir="test-report/alma-app"
shot_dir="${report_dir}/screenshots"
apk="apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
run_log="${RUNNER_TEMP:?}/alma-app.log"
android_log="${RUNNER_TEMP:?}/alma-app-android.log"
android_log_pid=""

mkdir -p "$report_dir" "$shot_dir"
exec > >(tee "$run_log") 2>&1

cleanup() {
  local status=$?
  trap - EXIT
  set +e
  if [[ -n "$android_log_pid" ]]; then
    kill "$android_log_pid" 2>/dev/null || true
    wait "$android_log_pid" 2>/dev/null || true
  fi
  cp "$android_log" "$report_dir/android.log" 2>/dev/null || true
  cp "$run_log" "$report_dir/run.log" 2>/dev/null || true
  adb exec-out screencap -p > "$shot_dir/adb-sign-in.png" 2>/dev/null || true
  find "$HOME/.maestro" "$report_dir" -name '*.png' -print 2>/dev/null | while read -r png; do
    cp -n "$png" "$shot_dir/" 2>/dev/null || true
  done
  exit "$status"
}
trap cleanup EXIT

if [[ ! -f "$apk" ]]; then
  echo "APK missing: $apk" >&2
  exit 1
fi

adb logcat -c || true
adb logcat > "$android_log" &
android_log_pid=$!

adb install -r -d "$apk"
adb shell pm grant do.alma.app android.permission.POST_NOTIFICATIONS || true

set +e
maestro test \
  --flatten-debug-output \
  --debug-output "${report_dir}/debug" \
  --test-output-dir "${report_dir}/maestro" \
  --format HTML \
  apps/mobile/.maestro/alma-app-signin.yaml
maestro_status=$?
set -e
echo "maestro_status=${maestro_status}" | tee "$report_dir/status.txt"
exit "$maestro_status"

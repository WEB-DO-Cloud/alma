#!/usr/bin/env bash
# Repeat the upstream sync from docs/designs/alma-upstream-sync-2026-11.md
# Usage, on a branch cut from ALMA main, after `git fetch upstream main`:
#   scripts/sync-upstream.sh
# The script stops before the merge commit so the surgical overlay can be re-applied.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
fork=05c5d241aa4f0c782f3a4b5207e6282d10d10250
git rev-parse --verify upstream/main >/dev/null
if [[ -f .git/MERGE_HEAD ]]; then
  echo "A merge is already in progress. Resolve it or abort it before running this script." >&2
  exit 1
fi
git merge --no-commit upstream/main || true
git read-tree --reset -u MERGE_HEAD
echo "Worktree matches upstream/main. Restore ALMA-only paths, then re-apply the surgical rules."
echo "Do not git reset, git merge --abort, or git checkout this branch name before committing."
echo "Refreshing the marketing integrations catalog onto alma.com.do."
python3 scripts/sync-integrations-catalog.py
git diff --name-only --diff-filter=ACMRTD "$fork" HEAD | while IFS= read -r path; do
  if git cat-file -e "HEAD:$path" 2>/dev/null && ! git cat-file -e "MERGE_HEAD:$path" 2>/dev/null; then
    echo "restore $path"
  fi
done

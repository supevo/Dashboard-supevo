#!/bin/bash
# SessionStart self-heal for Claude Code on the web.
#
# In remote sessions the container can be checkpointed and later resumed from
# an older filesystem snapshot. That rolls the local .git back to a stale
# commit, dropping local commits that were already pushed ("branch drift").
# Work is never lost (it lives on origin), but the working tree lands on an old
# base and edits/reads go wrong until re-aligned by hand.
#
# This hook re-aligns automatically: if we are on a claude/* agent branch with
# a CLEAN tree that has fallen behind or diverged from its pushed counterpart
# (origin/<branch>), reset to that remote. It NEVER touches a dirty tree, a
# non-agent branch, or a branch that is merely ahead (genuine unpushed work),
# and it keeps a recovery ref before any reset so nothing is unrecoverable.
set -uo pipefail

# Web sessions only - local checkouts manage their own git.
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

branch=$(git branch --show-current 2>/dev/null)
case "$branch" in
  claude/*) ;;
  *) exit 0 ;;
esac

# Only ever act on a pristine tree.
if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  exit 0
fi

git fetch origin "$branch" --quiet 2>/dev/null || exit 0
git rev-parse -q --verify "origin/$branch" >/dev/null 2>&1 || exit 0

local_sha=$(git rev-parse HEAD 2>/dev/null) || exit 0
remote_sha=$(git rev-parse "origin/$branch" 2>/dev/null) || exit 0
[ "$local_sha" = "$remote_sha" ] && exit 0

base=$(git merge-base HEAD "origin/$branch" 2>/dev/null) || exit 0

# Local strictly ahead of remote (unpushed local commits) -> leave it alone.
[ "$remote_sha" = "$base" ] && exit 0

# Behind or diverged -> the drift signature. Realign to the pushed branch,
# keeping a recovery ref for the pre-heal HEAD just in case.
git branch "backup/pre-heal-$(date +%s)" HEAD >/dev/null 2>&1 || true
git reset --hard "origin/$branch" >/dev/null 2>&1 || true
echo "session-start: git drift healed - realigned $branch from ${local_sha:0:7} to origin/$branch (${remote_sha:0:7})."
exit 0

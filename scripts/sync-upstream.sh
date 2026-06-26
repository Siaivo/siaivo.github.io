#!/bin/bash
# sync-upstream.sh — merge upstream/main into current branch
# without being blocked by build artifact conflicts.
#
# Usage:
#   bash scripts/sync-upstream.sh
#
# What it does:
#   1. git fetch upstream
#   2. git merge upstream/main (--no-ff for a merge commit)
#   3. auto-resolves modify/delete conflicts for:
#      - public/css/app.css        (source → src/sass/)
#      - public/lang/*.js          (source → src/lang/)
#   4. commits the merge
#
# These files are build artifacts. Their real sources live in
# src/sass/ and src/lang/, which received upstream changes
# through the normal 3-way merge.

set -euo pipefail

echo "→ Fetching upstream..."
git fetch upstream

CURRENT_BRANCH=$(git branch --show-current)
echo "→ Merging upstream/main into ${CURRENT_BRANCH}..."

# Attempt merge; ignore non-zero exit from conflicts
git merge upstream/main --no-edit --no-ff --no-commit 2>&1 || true

# ---- Auto-resolve known build-artifact modify/delete conflicts ----
# These files are generated at build time from src/sass/ and src/lang/.
# Upstream modifies them; we deleted them from tracking. -> modify/delete.
# Resolution: keep them deleted (ours). Upstream content is already
# reflected in the source files that auto-merged.
ARTIFACTS=(
  "public/css/app.css"
  "public/lang/be.js"
  "public/lang/bg.js"
  "public/lang/cs.js"
  "public/lang/en.js"
  "public/lang/fr.js"
  "public/lang/he.js"
  "public/lang/pl.js"
  "public/lang/pt.js"
  "public/lang/ro.js"
  "public/lang/ru.js"
  "public/lang/uk.js"
  "public/lang/zh.js"
  "public/lang/meta.js"
)

HAD_ARTIFACT_CONFLICTS=false

for file in "${ARTIFACTS[@]}"; do
  # Check if git sees this file as unmerged (conflicted)
  if git ls-files -u -- "$file" | grep -q .; then
    echo "  → Auto-resolving: ${file} (build artifact, keeping deleted)"
    git rm "$file" 2>/dev/null || true
    HAD_ARTIFACT_CONFLICTS=true
  fi
done

# ---- Check for remaining unresolved conflicts ----
REMAINING=$(git ls-files -u 2>/dev/null || true)
if [ -n "$REMAINING" ]; then
  echo ""
  echo "⚠  WARNING: There are still unresolved conflicts:"
  echo "$REMAINING" | awk '{print $4}' | sort -u
  echo ""
  echo "Resolve them manually, then run: git commit"
  exit 1
fi

# ---- Check if anything changed ----
if [ -z "$(git diff --cached --stat 2>/dev/null)" ]; then
  echo "  → Nothing new to merge. Aborting."
  git merge --abort 2>/dev/null || true
  exit 0
fi

git commit --no-edit
echo ""
echo "✅ Merge commit created successfully on ${CURRENT_BRANCH}."
echo "   Run 'git push origin ${CURRENT_BRANCH}' to publish."

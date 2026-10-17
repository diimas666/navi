#!/bin/sh
# Uploads the built map files to the public GitHub release the app downloads from.
# Usage: scripts/maps/publish.sh <out dir>. Needs `gh auth login` once.
set -e
out=${1:?map output folder}
tag=maps-v1
repo=diimas666/navi
if ! gh release view "$tag" --repo "$repo" >/dev/null 2>&1; then
  gh release create "$tag" --repo "$repo" --title "Офлайн-карти" \
    --notes "Файли офлайн-карт для застосунку. Оновлюються скриптом scripts/maps/build.py." --latest=false
fi
# The manifest goes last: the app only sees new files once all of them are in place.
find "$out" -maxdepth 1 -type f ! -name manifest.json ! -name '*.part' -print0 | \
  xargs -0 gh release upload "$tag" --repo "$repo" --clobber
gh release upload "$tag" --repo "$repo" --clobber "$out/manifest.json"
echo "✓ https://github.com/$repo/releases/tag/$tag"

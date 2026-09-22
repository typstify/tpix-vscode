#!/usr/bin/env bash
#
# Build a platform-specific .vsix. The matching tpix binary must already be in
# ./bin (use scripts/fetch-tpix.sh, which CI does automatically).
#
# Usage: scripts/package.sh <vscode-target>
#   e.g. scripts/package.sh linux-x64

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="${1:?usage: package.sh <vscode-target>}"
cd "$here"

exe="tpix"
[[ "$target" == win32-* ]] && exe="tpix.exe"
if [[ ! -f "bin/$exe" ]]; then
  echo "bin/$exe is missing; run: scripts/fetch-tpix.sh $target <version>" >&2
  exit 1
fi

scripts/vendor-codicons.sh
npm run compile

npx --yes @vscode/vsce package --target "$target"

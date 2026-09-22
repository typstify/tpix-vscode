#!/usr/bin/env bash
#
# Build a single, universal .vsix that bundles the tpix CLI for every supported
# platform (bin/<target>/). At runtime the extension picks the matching binary.
#
# All platforms must be present; use scripts/fetch-all-tpix.sh (CI does this).
#
# Usage: scripts/package.sh

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$here"

targets=(win32-x64 linux-x64 linux-arm64 darwin-x64 darwin-arm64)
missing=0
for target in "${targets[@]}"; do
  exe="tpix"
  [[ "$target" == win32-* ]] && exe="tpix.exe"
  if [[ ! -f "bin/$target/$exe" ]]; then
    echo "missing bin/$target/$exe" >&2
    missing=1
  fi
done
if [[ $missing -ne 0 ]]; then
  echo "run: scripts/fetch-all-tpix.sh <tpix-cli-version>" >&2
  exit 1
fi

scripts/vendor-codicons.sh
npm run compile

npx --yes @vscode/vsce package

#!/usr/bin/env bash
#
# Download the tpix CLI for every supported platform into ./bin/<target>/.
# The universal .vsix bundles all of them and picks the matching one at runtime.
#
# Usage: scripts/fetch-all-tpix.sh [tpix-cli-version]
#   e.g. scripts/fetch-all-tpix.sh v0.15.1

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="${1:-${TPIX_CLI_VERSION:-}}"

if [[ -z "$version" ]]; then
  echo "usage: fetch-all-tpix.sh <tpix-cli-version> (or set TPIX_CLI_VERSION)" >&2
  exit 1
fi

targets=(win32-x64 linux-x64 linux-arm64 darwin-x64 darwin-arm64)
for target in "${targets[@]}"; do
  "$here/scripts/fetch-tpix.sh" "$target" "$version"
done

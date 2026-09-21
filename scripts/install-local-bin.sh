#!/usr/bin/env bash
#
# TEMPORARY development helper: build tpix-cli from a neighboring checkout and
# copy the binary into ./bin so the extension can find it locally.
#
# In CI this will be replaced by downloading a pinned release from the
# tpix-cli GitHub releases API.
#
# Usage: scripts/install-local-bin.sh [path-to-tpix-cli]

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="${1:-"$here/../tpix-cli"}"

if [[ ! -d "$source_dir" ]]; then
  echo "tpix-cli checkout not found at: $source_dir" >&2
  exit 1
fi

exe="tpix"
if [[ "${OS:-}" == "Windows_NT" ]]; then
  exe="tpix.exe"
fi

mkdir -p "$here/bin"
(cd "$source_dir" && go build -o "$here/bin/$exe" ./cmd)

echo "installed $here/bin/$exe"

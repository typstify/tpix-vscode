#!/usr/bin/env bash
#
# Development helper: build tpix-cli from a neighboring checkout and install it
# into ./bin/<target>/ for the current platform, so the extension can find it.
#
# Usage: scripts/install-local-bin.sh [path-to-tpix-cli]

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="${1:-"$here/../tpix-cli"}"

if [[ ! -d "$source_dir" ]]; then
  echo "tpix-cli checkout not found at: $source_dir" >&2
  exit 1
fi

goos="$(cd "$source_dir" && go env GOOS)"
goarch="$(cd "$source_dir" && go env GOARCH)"

case "$goos/$goarch" in
  linux/amd64)   target="linux-x64" ;;
  linux/arm64)   target="linux-arm64" ;;
  darwin/amd64)  target="darwin-x64" ;;
  darwin/arm64)  target="darwin-arm64" ;;
  windows/amd64) target="win32-x64" ;;
  *)
    echo "unsupported local platform: $goos/$goarch" >&2
    exit 1
    ;;
esac

exe="tpix"
[[ "$target" == win32-* ]] && exe="tpix.exe"

dest_dir="$here/bin/$target"
rm -rf "$dest_dir"
mkdir -p "$dest_dir"
(cd "$source_dir" && go build -o "$dest_dir/$exe" ./cmd)

echo "installed $dest_dir/$exe"

#!/usr/bin/env bash
#
# Download the pinned tpix CLI release for a VS Code target platform and place
# the binary in ./bin so it can be bundled into the extension.
#
# Usage: scripts/fetch-tpix.sh <vscode-target> [tpix-cli-version]
#   e.g. scripts/fetch-tpix.sh linux-x64 v0.15.0
#
# The version can also be provided via the TPIX_CLI_VERSION environment variable.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="${1:?usage: fetch-tpix.sh <vscode-target> [tpix-cli-version]}"
version="${2:-${TPIX_CLI_VERSION:-}}"

case "$target" in
  win32-x64)    asset="tpix-cli-windows-amd64.tar.gz"; exe="tpix.exe" ;;
  linux-x64)    asset="tpix-cli-linux-amd64.tar.gz";   exe="tpix" ;;
  linux-arm64)  asset="tpix-cli-linux-arm64.tar.gz";   exe="tpix" ;;
  darwin-x64)   asset="tpix-cli-darwin-amd64.tar.gz";  exe="tpix" ;;
  darwin-arm64) asset="tpix-cli-darwin-arm64.tar.gz";  exe="tpix" ;;
  *)
    echo "unsupported target: $target" >&2
    echo "supported: win32-x64 linux-x64 linux-arm64 darwin-x64 darwin-arm64" >&2
    exit 1
    ;;
esac

if [[ -z "$version" ]]; then
  echo "no tpix-cli version given; pass one or set TPIX_CLI_VERSION" >&2
  exit 1
fi

url="https://github.com/typstify/tpix-cli/releases/download/${version}/${asset}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "downloading ${url}"
curl -fsSL "$url" -o "$tmp/pkg.tar.gz"
tar -xzf "$tmp/pkg.tar.gz" -C "$tmp" "$exe"

mkdir -p "$here/bin"
mv "$tmp/$exe" "$here/bin/$exe"
chmod +x "$here/bin/$exe"

echo "installed bin/$exe from tpix-cli ${version}"

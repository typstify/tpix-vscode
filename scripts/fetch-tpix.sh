#!/usr/bin/env bash
#
# Download the pinned tpix CLI release for a VS Code target platform and place
# it in ./bin/<target>/ so it can be bundled into the (universal) extension.
#
# Usage: scripts/fetch-tpix.sh <vscode-target> [tpix-cli-version]
#   e.g. scripts/fetch-tpix.sh linux-x64 v0.15.1
#
# The version can also be provided via the TPIX_CLI_VERSION environment variable.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="${1:?usage: fetch-tpix.sh <vscode-target> [tpix-cli-version]}"
version="${2:-${TPIX_CLI_VERSION:-}}"

case "$target" in
  win32-x64)    asset="tpix-cli-windows-amd64.tar.gz"; bin_name="tpix.exe" ;;
  linux-x64)    asset="tpix-cli-linux-amd64.tar.gz";   bin_name="tpix" ;;
  linux-arm64)  asset="tpix-cli-linux-arm64.tar.gz";   bin_name="tpix" ;;
  darwin-x64)   asset="tpix-cli-darwin-amd64.tar.gz";  bin_name="tpix" ;;
  darwin-arm64) asset="tpix-cli-darwin-arm64.tar.gz";  bin_name="tpix" ;;
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
curl -fsSL --retry 3 --retry-all-errors "$url" -o "$tmp/pkg.tar.gz"

if ! tar -xzf "$tmp/pkg.tar.gz" -C "$tmp" "$bin_name" 2>/dev/null; then
  echo "error: '${bin_name}' not found in ${asset} (${version})." >&2
  echo "       tpix-cli releases built before the Makefile fix ship the Windows" >&2
  echo "       binary as 'tpix'; pin a release that contains the fix." >&2
  tar tzf "$tmp/pkg.tar.gz" >&2
  exit 1
fi

mkdir -p "$here/bin"
dest_dir="$here/bin/$target"
rm -rf "$dest_dir"
mkdir -p "$dest_dir"
mv "$tmp/$bin_name" "$dest_dir/$bin_name"
chmod +x "$dest_dir/$bin_name"

echo "installed bin/$target/$bin_name from tpix-cli ${version}"

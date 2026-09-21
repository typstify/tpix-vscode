#!/usr/bin/env bash
#
# Vendor the VS Code Codicon font and stylesheet into media/ so the sidebar
# webview can use native-looking icons without shipping node_modules.
#
# Run after `npm install` (e.g. in CI before packaging) and commit the result.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dist="$here/node_modules/@vscode/codicons/dist"

if [[ ! -f "$dist/codicon.css" ]]; then
  echo "codicons not installed; run: npm install" >&2
  exit 1
fi

cp "$dist/codicon.ttf" "$here/media/codicon.ttf"
# Drop the content hash from the font URL so the relative path resolves inside
# the webview.
sed -E 's#url\("\./codicon\.ttf[^"]*"\)#url("./codicon.ttf")#' "$dist/codicon.css" > "$here/media/codicon.css"

echo "vendored codicons into media/"

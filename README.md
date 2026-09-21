# TPIX for VS Code

Manage [TPIX](https://tpix.typstify.com) Typst packages from VS Code.

The extension is a thin GUI over the `tpix` CLI. It never talks to the TPIX API
directly: every operation shells out to the bundled `tpix` binary with `--json`,
which emits exactly one structured result document on stdout. See
`tpix-cli/docs/json-output.md` for the contract.

## Design

The primary UI is a **single sidebar panel** (a webview) with four tabs, so
results are persistent and discoverable instead of flashing by in
notifications:

| Tab | What it does |
|---|---|
| **Search** | Search the Typst package index (with a package/library filter), open a result to see its details, and install any version. Copy-spec always includes the version. |
| **Project** | Scan the workspace for `#import "@ns/name"` imports, show cache status, expand any import to load its full transitive tree, and fetch all missing packages. |
| **Cache** | Browse the local package cache grouped into collapsible namespaces, then packages, then versions; reveal a package in the OS file explorer, or remove a version (icon actions). |
| **Activity** | A persistent log of operations and errors. |

The command palette stays small. Browsing/installing lives in the panel;
only occasional actions get a command:

- `TPIX: Open Panel`
- `TPIX: Install Package` (also used by the editor CodeLens)
- `TPIX: New Package`
- `TPIX: Bundle Package`
- `TPIX: Publish Package`

New/bundle/publish are commands rather than panel tabs because they are
occasional authorship actions: they act on a package directory and either
produce an artifact or perform an irreversible upload. The package directory is
resolved without guessing:

1. the nearest `typst.toml` above the active file (within its workspace folder);
2. otherwise all `typst.toml` files in the workspace — a QuickPick when there is
   more than one, so a multi-package workspace never silently picks the wrong one;
3. otherwise a folder picker.

Their outcome is also written to the panel's **Activity** log.

**Bundle** writes the archive next to the package (`tpix`'s default).
**Publish** bundles into a temporary file and deletes it after uploading, so
no `.tar.gz` is left in your project; if you invoke *Publish* from the Bundle
notification, the just-built archive is reused and kept.

Editor integration: an inline **“TPIX: Install”** CodeLens appears above Typst
imports whose package is not in the local cache.

## Requirements

The extension needs a `tpix` binary. It looks for one in this order:

1. the `tpix.binaryPath` setting,
2. the bundled `bin/tpix` (or `bin/tpix.exe` on Windows),
3. `tpix` on `PATH`.

## Development

```bash
npm install
scripts/vendor-codicons.sh   # vendor the Codicon font/css into media/
npm run compile        # type-check + emit ./out

# TEMPORARY: copy a locally built tpix binary for testing
scripts/install-local-bin.sh ../tpix-cli

npm test               # unit tests (also run against ./bin/tpix when present)
```

Then press `F5` (Run Extension) to launch an Extension Development Host, and
open the **TPIX** icon in the Activity Bar.

### Bundling the CLI

The `bin/` directory is gitignored. Locally, use
`scripts/install-local-bin.sh`. In CI, the pinned `tpix` release will be
downloaded from the tpix-cli GitHub releases API and placed in `bin/` before
packaging.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `tpix.binaryPath` | `""` | Absolute path to the `tpix` CLI binary. Empty uses the bundled binary or `PATH`. |

## Architecture

```
media/
  main.js             sidebar webview app (plain JS, no build step)
  main.css
  codicon.css         vendored from @vscode/codicons (icons)
  codicon.ttf
src/
  extension.ts        activation, wiring, palette commands
  packaging.ts        new / bundle / publish commands
  util.ts             shared helpers (errors, spec formatting)
  tpix/
    client.ts         spawns the CLI, parses the JSON envelope  (no vscode import)
    errors.ts         TpixError + exit codes                    (no vscode import)
    types.ts          result payload types                      (no vscode import)
    binary.ts         binary resolution
    service.ts        client lifecycle + progress UI
  views/
    tpixView.ts       sidebar webview provider (state + message handling)
    importCodeLens.ts CodeLens for #import lines
```

`client.ts`, `errors.ts`, and `types.ts` are deliberately free of `vscode`
imports so they can be unit-tested and reused outside the extension host. The
webview (`media/`) only receives JSON state and posts user actions back; it
never runs the CLI itself.

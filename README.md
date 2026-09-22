# TPIX for VS Code

Manage [TPIX](https://tpix.typstify.com) Typst packages from VS Code.

The extension is a thin GUI over the `tpix` CLI. It uses the tpix-cli with json output to talks to the TPIX server.
. Every operation shells out to the bundled `tpix` binary with `--json`. See 
[tpix-cli/docs/json-output.md](https://github.com/typstify/tpix-cli/blob/main/docs/json-output.md) for the contract.

## Design

### Sidebar Panel

The primary UI is a single sidebar panel wit tabs:

| Tab | What it does |
|---|---|
| **Search** | Search the Typst package index (with a package/library filter). |
| **Project** | Scan the workspace for package dependency tree, and fetch all missing packages. |
| **Cache** | Browse the local package cache grouped by namespaces. |
| **Activity** | A persistent log of operations and errors. |

### Commands

The command palette only keep a small set of tpix commands:

- `TPIX: Open Panel`
- `TPIX: Install Package` (also used by the editor CodeLens)
- `TPIX: New Package`
- `TPIX: Bundle Package`
- `TPIX: Publish Package`

New/bundle/publish are commands act on a package directory and either
produce an artifact or perform an irreversible upload. The package directory is
resolved with the following rules:

1. the nearest `typst.toml` above the active file (within its workspace folder);
2. otherwise all `typst.toml` files in the workspace — a QuickPick when there is
   more than one, so a multi-package workspace never silently picks the wrong one;
3. otherwise a folder picker.

Their outcome is also written to the panel's **Activity** log.

**Bundle** writes the archive next to the package.
**Publish** bundles into a temporary file and deletes it after uploading, so
no `.tar.gz` is left in your project; if you invoke *Publish* from the Bundle
notification, the just-built archive is reused and kept.

### Editor integration

An inline **“TPIX: Install”** CodeLens appears above Typst imports whose package is not in the local cache.

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

The `bin/` directory is gitignored. Locally, use `scripts/install-local-bin.sh`. 
In CI, the pinned `tpix` release will be downloaded from the tpix-cli GitHub releases API and placed in `bin/` before packaging.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `tpix.binaryPath` | `""` | Absolute path to the `tpix` CLI binary. Empty uses the bundled binary or `PATH`. |


## Packaging & publishing

The extension bundles a platform-specific `tpix` binary, so each VS Code platform gets its own `.vsix` (`--target`).

```bash
# 1. Put the pinned tpix binary in ./bin for the target platform
scripts/fetch-tpix.sh linux-x64 v0.15.0

# 2. Vendor the Codicon font, compile, and build the .vsix
scripts/package.sh linux-x64
# -> tpix-vscode-linux-x64-0.0.1.vsix
```

Targets: `win32-x64`, `linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`
(`tpix-cli` has no `windows-arm64` build).

Install locally to test the packaged extension:

```bash
code --install-extension tpix-vscode-linux-x64-0.0.1.vsix
# or: Extensions view -> ... -> Install from VSIX...
```

### Marketplace

One-time setup:

1. Create the `typstify` publisher at
   <https://marketplace.visualstudio.com/manage>.
2. Create an Azure DevOps personal access token with the **Marketplace >
   Manage** scope and run `npx @vscode/vsce login typstify`.

Publish a built package (or several targets at once):

```bash
npx @vscode/vsce publish --packagePath tpix-vscode-linux-x64-0.0.1.vsix
```

### CI

`.github/workflows/release.yml` packages every target and publishes them on a
GitHub release. To use it:

- add a `VSCE_PAT` repository secret;
- bump `version` in `package.json` and `TPIX_CLI_VERSION` in the workflow;
- draft a GitHub release (the tag becomes the extension version's release).

For [Open VSX](https://open-vsx.org), add an `OVSX_PAT` secret and publish the
same `.vsix` files with `npx ovsx publish`.

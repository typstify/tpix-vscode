# TPIX for VS Code

Manage [TPIX](https://tpix.typstify.com) Typst packages from VS Code.

The extension is a thin GUI over the `tpix` CLI. It uses the tpix-cli with json output to talks to the TPIX server.
. Every operation shells out to the bundled `tpix` binary with `--json`. See 
[tpix-cli/docs/json-output.md](https://github.com/typstify/tpix-cli/blob/main/docs/json-output.md) for the contract.

## Features

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

## Configuration

| Setting | Default | Description |
|---|---|---|
| `tpix.binaryPath` | `""` | Absolute path to the `tpix` CLI binary. Empty uses the bundled binary or `PATH`. |



## Development

```bash
npm install
scripts/vendor-codicons.sh   # vendor the Codicon font/css into media/
npm run compile        # type-check + emit ./out

# TEMPORARY: copy a locally built tpix binary for testing
scripts/install-local-bin.sh ../tpix-cli

npm test               # unit tests (also run against the bundled binary when present)
```

Then press `F5` (Run Extension) to launch an Extension Development Host, and
open the **TPIX** icon in the Activity Bar.

### Bundling the CLI

`bin/` is gitignored and holds one binary per platform (`bin/<target>/tpix[.exe]`).
Locally, `scripts/install-local-bin.sh` builds the neighboring tpix-cli checkout
into the current platform's directory. To fetch released binaries for every
platform, use `scripts/fetch-all-tpix.sh <version>`.


### Packaging

A single **universal** `.vsix` bundles a `tpix` binary for every supported
platform and picks the right one at runtime (`process.platform` +
`process.arch`). One artifact also matches the Marketplace web upload, which
takes a single file per version.

```bash
# 1. Fetch the pinned tpix CLI for all platforms into ./bin/<target>/
scripts/fetch-all-tpix.sh v0.15.1

# 2. Vendor the Codicon font, compile, and build the universal .vsix
scripts/package.sh
# -> tpix-vscode-0.0.1.vsix
```

Platforms bundled: `win32-x64`, `linux-x64`, `linux-arm64`, `darwin-x64`,
`darwin-arm64` (`tpix-cli` has no `windows-arm64` build).

Install locally to test the packaged extension:

```bash
code --install-extension tpix-vscode-0.0.1.vsix
# or: Extensions view -> ... -> Install from VSIX...
```

### Publishing

The version comes from `package.json`; bump it before building
(`npm version patch --no-git-tag-version`). Marketplace publishing normally goes
through the CLI, which requires an Azure DevOps PAT with the **Marketplace >
Manage** scope:

```bash
npx @vscode/vsce publish --packagePath tpix-vscode-0.0.1.vsix
```

If you cannot use a PAT, upload the built `.vsix` through the Marketplace
publisher page instead.

### CI

`.github/workflows/release.yml` builds the universal `.vsix` and does **not**
publish:

- run it manually (Actions → *Build VSIX* → *Run workflow*), or publish a GitHub
  release to also attach the `.vsix` to it;
- optionally set `tpix_cli_version` when triggering;
- download the `tpix-vscode-vsix` artifact and publish/upload it yourself.

For [Open VSX](https://open-vsx.org), publish the same `.vsix` with
`npx ovsx publish`.

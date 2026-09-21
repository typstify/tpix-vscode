# TPIX for VS Code

Manage [TPIX](https://tpix.typstify.com) Typst packages from VS Code.

The extension is a thin GUI over the `tpix` CLI. It never talks to the TPIX API
directly: every operation shells out to the bundled `tpix` binary with
`--json`, which emits exactly one structured result document on stdout. See
`tpix-cli/docs/json-output.md` for the contract.

## Features

- **Cached Packages** view: browse locally cached packages (namespace → name →
  version), reveal them in the file explorer, or remove them.
- **Search** Typst packages and inspect their details.
- **Install** a package (`tpix get`) with transitive dependencies; the result
  reports how many packages were downloaded vs already cached.
- **Fetch project dependencies** (`tpix pull`) for the current workspace.
- **Login / Logout / Whoami**: credentials are shared with the CLI config, so
  logging in here also works in a terminal.

## Requirements

The extension needs a `tpix` binary. It looks for one in this order:

1. the `tpix.binaryPath` setting,
2. the bundled `bin/tpix` (or `bin/tpix.exe` on Windows),
3. `tpix` on `PATH`.

## Development

```bash
npm install
npm run compile        # type-check + emit ./out

# TEMPORARY: copy a locally built tpix binary for testing
scripts/install-local-bin.sh ../tpix-cli

npm test               # unit tests (also run against ./bin/tpix when present)
```

Then press `F5` (Run Extension) to launch an Extension Development Host.

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
src/
  extension.ts        activation, wiring
  commands.ts         command handlers (search/install/info/pull/auth/...)
  util.ts             shared UI helpers (errors, spec formatting)
  tpix/
    client.ts         spawns the CLI, parses the JSON envelope  (no vscode import)
    errors.ts         TpixError + exit codes                    (no vscode import)
    types.ts          result payload types                      (no vscode import)
    binary.ts         binary resolution
    service.ts        client lifecycle + progress/output UI
  views/
    cacheTree.ts      cached packages tree view
```

`client.ts`, `errors.ts`, and `types.ts` are deliberately free of `vscode`
imports so they can be unit-tested and reused outside the extension host.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

/**
 * VS Code target platform key for the running host, e.g. `linux-x64`,
 * `darwin-arm64`, `win32-x64`. Matches the `bin/<key>/` layout produced by
 * `scripts/fetch-tpix.sh` and used by the universal .vsix.
 */
export function platformKey(): string {
  return `${process.platform}-${process.arch}`;
}

/** Bundled binary file name for this host. */
export function binaryFileName(): string {
  return process.platform === 'win32' ? 'tpix.exe' : 'tpix';
}

/**
 * Resolves the tpix binary to run.
 *
 * Precedence:
 *  1. the `tpix.binaryPath` setting,
 *  2. the bundled binary for this platform, `bin/<platform>-<arch>/tpix[.exe]`,
 *  3. `tpix` on PATH.
 *
 * The universal .vsix ships a binary for every supported platform and picks
 * the matching one here, so a single package works everywhere.
 */
export function resolveBinaryPath(context: vscode.ExtensionContext): string {
  const configured = vscode.workspace.getConfiguration('tpix').get<string>('binaryPath');
  if (configured && configured.trim()) {
    return configured.trim();
  }

  const exe = binaryFileName();
  const bundled = path.join(context.extensionPath, 'bin', platformKey(), exe);
  if (fs.existsSync(bundled)) {
    try {
      fs.chmodSync(bundled, 0o755);
    } catch {
      // Best effort: chmod is a no-op on Windows.
    }
    return bundled;
  }

  return exe;
}

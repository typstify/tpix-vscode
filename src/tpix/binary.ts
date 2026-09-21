import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

/**
 * Resolves the tpix binary to run.
 *
 * Precedence:
 *  1. the `tpix.binaryPath` setting,
 *  2. the bundled binary at `bin/tpix` (fetched by CI / copied locally),
 *  3. `tpix` on PATH.
 */
export function resolveBinaryPath(context: vscode.ExtensionContext): string {
  const configured = vscode.workspace.getConfiguration('tpix').get<string>('binaryPath');
  if (configured && configured.trim()) {
    return configured.trim();
  }

  const exe = process.platform === 'win32' ? 'tpix.exe' : 'tpix';
  const bundled = path.join(context.extensionPath, 'bin', exe);
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

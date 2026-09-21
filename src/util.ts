import * as vscode from 'vscode';
import { TpixError } from './tpix/errors';
import type { PackageRef } from './tpix/types';

/** Formats a package as `@namespace/name:version`. */
export function specOf(pkg: PackageRef): string {
  return `@${pkg.namespace}/${pkg.name}:${pkg.version}`;
}

/** Presents a tpix failure to the user, offering a login action when relevant. */
export function handleError(err: unknown): void {
  if (err instanceof TpixError) {
    if (err.isAuthError) {
      void vscode.window
        .showWarningMessage(`TPIX: ${err.message}. You need to log in.`, 'Login')
        .then((choice) => {
          if (choice === 'Login') {
            void vscode.commands.executeCommand('tpix.login');
          }
        });
      return;
    }

    const detail = err.description ? `${err.message} (${err.description})` : err.message;
    void vscode.window.showErrorMessage(`TPIX: ${detail}`);
    return;
  }

  void vscode.window.showErrorMessage(`TPIX: ${err instanceof Error ? err.message : String(err)}`);
}

/** The first workspace folder, used as the working directory for project commands. */
export function workspaceCwd(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

import * as vscode from 'vscode';
import { registerPackagingCommands } from './packaging';
import { TpixService } from './tpix/service';
import { ImportCodeLensProvider } from './views/importCodeLens';
import { TpixViewProvider } from './views/tpixView';

export function activate(context: vscode.ExtensionContext): void {
  const service = new TpixService(context);
  const view = new TpixViewProvider(service, context.extensionUri);
  const codeLenses = new ImportCodeLensProvider(service);

  context.subscriptions.push(service, view, codeLenses);

  // The sidebar panel is the primary UI; it drives every operation.
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(TpixViewProvider.viewType, view, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Editor integration: install imports directly from the editor.
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider([{ language: 'typst' }, { pattern: '**/*.typ' }], codeLenses),
  );

  // Keep the command surface intentionally tiny. Browse/install live in the
  // sidebar panel; only occasional actions get a palette command.
  context.subscriptions.push(
    vscode.commands.registerCommand('tpix.open', () =>
      vscode.commands.executeCommand(`${TpixViewProvider.viewType}.focus`),
    ),
    vscode.commands.registerCommand('tpix.install', (spec?: string) => view.installFromCommand(spec)),
  );

  registerPackagingCommands(context, { service, view });

  // Refresh the "Install" CodeLens whenever the local cache changes.
  view.onDidChangePackages(() => codeLenses.refresh());
}

export function deactivate(): void {
  // Disposables registered in activate() are cleaned up by VS Code.
}

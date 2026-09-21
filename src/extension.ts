import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { TpixService } from './tpix/service';
import { CacheTreeProvider } from './views/cacheTree';

export function activate(context: vscode.ExtensionContext): void {
  const service = new TpixService(context);
  const cacheTree = new CacheTreeProvider(service);

  context.subscriptions.push(service);
  context.subscriptions.push(vscode.window.registerTreeDataProvider('tpix.cache', cacheTree));

  registerCommands(context, service, cacheTree);
}

export function deactivate(): void {
  // Nothing to clean up beyond the disposables registered in activate().
}

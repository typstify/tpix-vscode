import * as vscode from 'vscode';
import { resolveBinaryPath } from './binary';
import { TpixClient, type TpixRunOptions } from './client';

/**
 * Owns the {@link TpixClient} lifecycle and adds VS Code affordances
 * (progress notifications, an output channel, cancellation).
 */
export class TpixService implements vscode.Disposable {
  private readonly output: vscode.OutputChannel;
  private readonly disposables: vscode.Disposable[] = [];
  private client?: TpixClient;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.output = vscode.window.createOutputChannel('TPIX');
    this.disposables.push(this.output);
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('tpix.binaryPath')) {
          this.client = undefined;
        }
      }),
    );
  }

  /** Returns a client for the currently configured binary. */
  getClient(): TpixClient {
    if (!this.client) {
      this.client = new TpixClient({ binaryPath: resolveBinaryPath(this.context) });
    }
    return this.client;
  }

  /**
   * Runs a CLI operation behind a cancellable progress notification. Progress
   * lines from stderr are shown in the notification and written to the output
   * channel.
   */
  async withProgress<T>(
    title: string,
    fn: (options: TpixRunOptions) => Promise<T>,
    base: TpixRunOptions = {},
  ): Promise<T> {
    const result = await vscode.window.withProgress<T>(
      { location: vscode.ProgressLocation.Notification, title, cancellable: true },
      (progress, token) => {
        const controller = new AbortController();
        token.onCancellationRequested(() => controller.abort());

        const options: TpixRunOptions = {
          ...base,
          signal: controller.signal,
          onProgress: (line) => {
            progress.report({ message: line.trim() });
            this.output.appendLine(line.trimEnd());
          },
        };
        return fn(options);
      },
    );
    return result;
  }

  log(line: string): void {
    this.output.appendLine(line);
  }

  showOutput(): void {
    this.output.show(true);
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}

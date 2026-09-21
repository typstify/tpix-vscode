import * as vscode from 'vscode';
import type { TpixService } from '../tpix/service';
import { specOf } from '../util';

/**
 * Matches `#import "@namespace/name[:version]"` in Typst sources. The version
 * is optional.
 */
const IMPORT_PATTERN = /#import\s+"(@[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+(?::[^"]+)?)"/g;

/**
 * Adds an "Install" CodeLens above Typst imports whose package is not present
 * in the local cache.
 */
export class ImportCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;

  private cacheSet?: Set<string>;
  private loading?: Promise<Set<string> | undefined>;
  private failed = false;

  constructor(private readonly service: TpixService) {}

  dispose(): void {
    this.emitter.dispose();
  }

  /** Re-reads the cache and refreshes the lenses. */
  refresh(): void {
    this.cacheSet = undefined;
    this.failed = false;
    this.emitter.fire();
  }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const cached = await this.loadCache();
    const text = document.getText();
    const lenses: vscode.CodeLens[] = [];

    IMPORT_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IMPORT_PATTERN.exec(text)) !== null) {
      const spec = match[1];
      if (cached?.has(spec)) {
        continue;
      }

      const start = document.positionAt(match.index);
      const line = document.lineAt(start.line);
      lenses.push(
        new vscode.CodeLens(line.range, {
          title: '$(cloud-download) TPIX: Install',
          command: 'tpix.install',
          arguments: [spec],
        }),
      );
    }

    return lenses;
  }

  private async loadCache(): Promise<Set<string> | undefined> {
    if (this.cacheSet) {
      return this.cacheSet;
    }
    if (this.failed) {
      return undefined;
    }

    if (!this.loading) {
      this.loading = (async () => {
        try {
          const result = await this.service.getClient().list();
          this.cacheSet = new Set((result.packages ?? []).map(specOf));
        } catch {
          // The cache is unavailable (e.g. binary missing); show lenses for all
          // imports rather than failing to provide any. Do not retry on every
          // keystroke; refresh() clears this.
          this.failed = true;
        }
        return this.cacheSet;
      })().finally(() => {
        this.loading = undefined;
      });
    }

    return this.loading;
  }
}

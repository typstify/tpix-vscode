import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import type { TpixService } from '../tpix/service';
import type {
  CachedPackage,
  DependencyNodeDto,
  PackageResponse,
  SearchResult,
  WhoamiResult,
} from '../tpix/types';
import { handleError, specOf, workspaceCwd } from '../util';

export interface ProjectNode {
  namespace: string;
  name: string;
  version: string;
  cached: boolean;
  direct: boolean;
  /** Whether children have been resolved (empty children are valid once resolved). */
  resolved: boolean;
  children?: ProjectNode[];
}

export interface ActivityEntry {
  time: string;
  level: 'info' | 'error';
  message: string;
}

export interface TpixViewState {
  account: WhoamiResult | null;
  search: { query: string; results: SearchResult[]; loading: boolean } | null;
  detail: PackageResponse | null;
  project: { nodes: ProjectNode[]; loading: boolean } | null;
  cache: { cachePath: string; packages: CachedPackage[] } | null;
  activity: ActivityEntry[];
}

/**
 * The single TPIX sidebar panel. It is a webview view that renders search,
 * project dependencies, the local cache and an activity log, and drives every
 * operation through messages to this provider.
 *
 * Keeping one web UI avoids a large command surface and makes results
 * persistent and discoverable.
 */
export class TpixViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewType = 'tpix.home';

  private view?: vscode.WebviewView;
  private account: WhoamiResult | null = null;
  private search: TpixViewState['search'] = null;
  private detail: PackageResponse | null = null;
  private project: TpixViewState['project'] = null;
  private cache: TpixViewState['cache'] = null;
  private readonly activity: ActivityEntry[] = [];

  private readonly packagesEmitter = new vscode.EventEmitter<void>();
  /** Fires when the local cache changed (used to refresh the CodeLens). */
  readonly onDidChangePackages = this.packagesEmitter.event;

  private readonly disposables: vscode.Disposable[] = [this.packagesEmitter];
  private bootstrapped = false;

  constructor(
    private readonly service: TpixService,
    private readonly extensionUri: vscode.Uri,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    view.webview.html = this.html(view.webview);

    this.disposables.push(
      view.webview.onDidReceiveMessage((message) => void this.onMessage(message)),
      view.onDidDispose(() => {
        this.view = undefined;
      }),
    );

    this.post();

    if (!this.bootstrapped) {
      this.bootstrapped = true;
      void this.bootstrap();
    }
  }

  /** Installs a package, prompting for a spec when invoked from the command palette. */
  async installFromCommand(spec?: string): Promise<void> {
    const target =
      spec ??
      (
        await vscode.window.showInputBox({
          prompt: 'Package to install',
          placeHolder: '@namespace/name or @namespace/name:version',
          ignoreFocusOut: true,
        })
      )?.trim();
    if (!target) {
      return;
    }
    await this.install(target);
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private async bootstrap(): Promise<void> {
    await Promise.all([this.refreshAccount(true), this.refreshCache(true), this.refreshProject(true)]);
  }

  private snapshot(): TpixViewState {
    return {
      account: this.account,
      search: this.search,
      detail: this.detail,
      project: this.project,
      cache: this.cache,
      activity: this.activity,
    };
  }

  private post(): void {
    void this.view?.webview.postMessage({ type: 'state', state: this.snapshot() });
  }

  /** Appends an entry to the sidebar Activity log (visible when the panel is open). */
  log(message: string, level: 'info' | 'error' = 'info'): void {
    this.activity.unshift({ time: new Date().toLocaleTimeString(), level, message });
    if (this.activity.length > 200) {
      this.activity.length = 200;
    }
  }

  private fail(err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    this.log(message, 'error');
    handleError(err);
  }

  private async onMessage(message: any): Promise<void> {
    switch (message?.type) {
      case 'ready':
        this.post();
        break;
      case 'login':
        await this.login();
        break;
      case 'logout':
        await this.logout();
        break;
      case 'search':
        await this.searchPackages(String(message.query ?? ''), message.kind);
        break;
      case 'showDetail':
        await this.showDetail(String(message.spec ?? ''));
        break;
      case 'clearDetail':
        this.detail = null;
        this.post();
        break;
      case 'install':
        await this.install(String(message.spec ?? ''));
        break;
      case 'refreshProject':
        await this.refreshProject(false);
        break;
      case 'expandDependency':
        await this.expandDependency(String(message.spec ?? ''));
        break;
      case 'fetchMissing':
        await this.fetchMissing();
        break;
      case 'refreshCache':
        await this.refreshCache(false);
        break;
      case 'removeCached':
        await this.removeCached(String(message.spec ?? ''));
        break;
      case 'reveal':
        if (message.path) {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(String(message.path)));
        }
        break;
      case 'openExternal':
        if (message.url) {
          await vscode.env.openExternal(vscode.Uri.parse(String(message.url)));
        }
        break;
      case 'copy':
        if (message.text) {
          await vscode.env.clipboard.writeText(String(message.text));
        }
        break;
      case 'clearActivity':
        this.activity.length = 0;
        this.post();
        break;
    }
  }

  private async refreshAccount(quiet = false): Promise<void> {
    try {
      this.account = quiet
        ? await this.service.getClient().whoami()
        : await this.service.withProgress('Fetching TPIX profile...', (options) =>
            this.service.getClient().whoami(options),
          );
    } catch {
      this.account = null;
    }
    this.post();
  }

  private async login(): Promise<void> {
    const apiKey = await vscode.window.showInputBox({
      title: 'TPIX login',
      prompt: 'API key issued by https://tpix.typstify.com',
      password: true,
      ignoreFocusOut: true,
    });
    if (!apiKey) {
      return;
    }

    try {
      await this.service.withProgress('Saving TPIX API key...', (options) =>
        this.service.getClient().login(apiKey, options),
      );
      await this.refreshAccount(true);
      this.log(
        this.account ? `Logged in as ${this.account.username}.` : 'API key saved but could not be verified.',
        this.account ? 'info' : 'error',
      );
    } catch (err) {
      this.fail(err);
    }
    this.post();
  }

  private async logout(): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      'Remove the stored TPIX API key?',
      { modal: true },
      'Logout',
    );
    if (confirm !== 'Logout') {
      return;
    }

    try {
      await this.service.withProgress('Logging out...', (options) => this.service.getClient().logout(options));
      this.account = null;
      this.log('Logged out.');
    } catch (err) {
      this.fail(err);
    }
    this.post();
  }

  private async searchPackages(query: string, kind?: string): Promise<void> {
    if (!query.trim()) {
      return;
    }

    const searchKind: 'all' | 'pkg' | 'template' = kind === 'pkg' || kind === 'template' ? kind : 'all';
    this.search = { query, results: [], loading: true };
    this.detail = null;
    this.post();

    try {
      const result = await this.service.withProgress(`Searching for "${query}"...`, (options) =>
        this.service.getClient().search(query, { ...options, kind: searchKind, limit: 50 }),
      );
      this.search = { query, results: result.results ?? [], loading: false };
      this.log(`Found ${result.count} result(s) for "${query}".`);
    } catch (err) {
      this.search = { query, results: [], loading: false };
      this.fail(err);
    }
    this.post();
  }

  private async showDetail(spec: string): Promise<void> {
    if (!spec) {
      return;
    }
    try {
      const pkg = await this.service.withProgress(`Loading ${spec}...`, (options) =>
        this.service.getClient().info(spec, options),
      );
      this.detail = pkg;
      this.log(`Loaded @${pkg.namespace}/${pkg.name}.`);
    } catch (err) {
      this.fail(err);
    }
    this.post();
  }

  private async install(spec: string): Promise<void> {
    if (!spec) {
      return;
    }
    try {
      const result = await this.service.withProgress(`Installing ${spec}...`, (options) =>
        this.service.getClient().get(spec, options),
      );
      const downloaded = result.packages.filter((pkg) => !pkg.cached).length;
      this.log(`Installed ${spec}: ${result.resolved} package(s), ${downloaded} downloaded.`);
      await Promise.all([this.refreshCache(true), this.refreshProject(true)]);
      this.packagesEmitter.fire();
    } catch (err) {
      this.fail(err);
    }
    this.post();
  }

  private async refreshProject(quiet = false): Promise<void> {
    const cwd = workspaceCwd();
    if (!cwd) {
      this.project = { nodes: [], loading: false };
      this.post();
      return;
    }

    this.project = { nodes: this.project?.nodes ?? [], loading: true };
    this.post();

    try {
      const result = quiet
        ? await this.service.getClient().pull({ cwd, dryRun: true })
        : await this.service.withProgress('Scanning project for TPIX imports...', (options) =>
            this.service.getClient().pull({ ...options, cwd, dryRun: true }),
          );
      this.project = {
        nodes: (result.direct ?? []).map((pkg) => ({
          namespace: pkg.namespace,
          name: pkg.name,
          version: pkg.version,
          cached: pkg.cached,
          direct: true,
          resolved: false,
        })),
        loading: false,
      };
    } catch (err) {
      this.project = { nodes: [], loading: false };
      this.fail(err);
    }
    this.post();
  }

  private async expandDependency(spec: string): Promise<void> {
    const node = this.project ? findNode(this.project.nodes, spec) : undefined;
    if (!node || node.resolved) {
      return;
    }

    try {
      const graph = await this.service.withProgress(`Resolving ${spec}...`, (options) =>
        this.service.getClient().deps(spec, options),
      );
      node.children = (graph.root.children ?? []).map(dtoToNode);
      node.resolved = true;
    } catch (err) {
      node.children = [];
      node.resolved = true;
      this.fail(err);
    }
    this.post();
  }

  private async fetchMissing(): Promise<void> {
    const cwd = workspaceCwd();
    if (!cwd) {
      this.log('Open a folder to fetch project dependencies.', 'error');
      this.post();
      return;
    }

    try {
      const result = await this.service.withProgress('Fetching project dependencies...', (options) =>
        this.service.getClient().pull({ ...options, cwd }),
      );
      const downloaded = result.packages.filter((pkg) => !pkg.cached).length;
      this.log(`Fetched project dependencies: ${result.resolved} package(s), ${downloaded} downloaded.`);
      await Promise.all([this.refreshCache(true), this.refreshProject(true)]);
      this.packagesEmitter.fire();
    } catch (err) {
      this.fail(err);
    }
    this.post();
  }

  private async refreshCache(quiet = false): Promise<void> {
    try {
      const result = quiet
        ? await this.service.getClient().list()
        : await this.service.withProgress('Loading cached packages...', (options) =>
            this.service.getClient().list(options),
          );
      this.cache = { cachePath: result.cachePath, packages: result.packages ?? [] };
    } catch (err) {
      this.cache = { cachePath: '', packages: [] };
      this.fail(err);
    }
    this.post();
  }

  private async removeCached(spec: string): Promise<void> {
    if (!spec) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Remove ${spec} from the local cache?`,
      { modal: true },
      'Remove',
    );
    if (confirm !== 'Remove') {
      return;
    }

    try {
      await this.service.withProgress(`Removing ${spec}...`, (options) =>
        this.service.getClient().remove(spec, options),
      );
      this.log(`Removed ${spec} from the cache.`);
      await Promise.all([this.refreshCache(true), this.refreshProject(true)]);
      this.packagesEmitter.fire();
    } catch (err) {
      this.fail(err);
    }
    this.post();
  }

  private html(webview: vscode.Webview): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css'));
    const codiconUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'codicon.css'));
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource} 'nonce-${nonce}'`,
      `script-src ${webview.cspSource} 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} https: data:`,
      `font-src ${webview.cspSource}`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${codiconUri}">
<link rel="stylesheet" href="${styleUri}">
</head>
<body>
<div id="app"><div style="padding:8px">Loading TPIX…</div></div>
<script nonce="${nonce}">
// Fallback so a failing script is visible instead of leaving a blank panel.
window.addEventListener('error', function (event) {
  var app = document.getElementById('app');
  if (app) {
    app.textContent = 'TPIX webview error: ' + (event.message || String(event.error));
  }
});
</script>
<script src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function findNode(nodes: ProjectNode[], spec: string): ProjectNode | undefined {
  for (const node of nodes) {
    if (specOf(node) === spec) {
      return node;
    }
    const found = node.children ? findNode(node.children, spec) : undefined;
    if (found) {
      return found;
    }
  }
  return undefined;
}

function dtoToNode(dto: DependencyNodeDto): ProjectNode {
  return {
    namespace: dto.package.namespace,
    name: dto.package.name,
    version: dto.package.version,
    cached: dto.cached,
    direct: false,
    resolved: true,
    children: (dto.children ?? []).map(dtoToNode),
  };
}

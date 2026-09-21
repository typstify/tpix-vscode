import * as vscode from 'vscode';
import type { TpixService } from '../tpix/service';
import type { CachedPackage } from '../tpix/types';
import { compareVersions, handleError } from '../util';

type CacheNode = NamespaceNode | PackageNode | VersionNode;

interface NamespaceNode {
  readonly kind: 'namespace';
  readonly namespace: string;
  readonly packages: CachedPackage[];
}

interface PackageNode {
  readonly kind: 'package';
  readonly namespace: string;
  readonly name: string;
  readonly versions: CachedPackage[];
}

export interface VersionNode {
  readonly kind: 'version';
  readonly pkg: CachedPackage;
}

/**
 * Tree of locally cached packages: namespace → package name → version.
 * Data is fetched lazily via `tpix list --json` and cached until refreshed.
 */
export class CacheTreeProvider implements vscode.TreeDataProvider<CacheNode> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  private packages?: CachedPackage[];

  constructor(private readonly service: TpixService) {}

  refresh(): void {
    this.packages = undefined;
    this.emitter.fire();
  }

  getTreeItem(element: CacheNode): vscode.TreeItem {
    if (element.kind === 'namespace') {
      const item = new vscode.TreeItem(element.namespace, vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = new vscode.ThemeIcon('symbol-namespace');
      item.description = `${element.packages.length} package(s)`;
      return item;
    }

    if (element.kind === 'package') {
      const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = new vscode.ThemeIcon('package');
      item.description =
        element.versions.length > 1 ? `${element.versions.length} versions` : element.versions[0]?.version;
      return item;
    }

    const item = new vscode.TreeItem(element.pkg.version, vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'tpixVersion';
    item.iconPath = new vscode.ThemeIcon('versions');
    if (element.pkg.path) {
      item.tooltip = new vscode.MarkdownString(`\`${element.pkg.path}\``);
    }
    item.command = {
      command: 'tpix.revealPackage',
      title: 'Reveal in File Explorer',
      arguments: [element],
    };
    return item;
  }

  async getChildren(element?: CacheNode): Promise<CacheNode[]> {
    const packages = await this.load();

    if (!element) {
      const byNamespace = new Map<string, CachedPackage[]>();
      for (const pkg of packages) {
        const list = byNamespace.get(pkg.namespace) ?? [];
        list.push(pkg);
        byNamespace.set(pkg.namespace, list);
      }
      return [...byNamespace.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([namespace, list]) => ({ kind: 'namespace', namespace, packages: list }));
    }

    if (element.kind === 'namespace') {
      const byName = new Map<string, CachedPackage[]>();
      for (const pkg of element.packages) {
        const list = byName.get(pkg.name) ?? [];
        list.push(pkg);
        byName.set(pkg.name, list);
      }
      return [...byName.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, versions]) => ({ kind: 'package', namespace: element.namespace, name, versions }));
    }

    if (element.kind === 'package') {
      return [...element.versions]
        .sort((a, b) => compareVersions(b.version, a.version))
        .map((pkg) => ({ kind: 'version', pkg }));
    }

    return [];
  }

  private async load(): Promise<CachedPackage[]> {
    if (this.packages) {
      return this.packages;
    }

    try {
      const result = await this.service.withProgress('Loading cached TPIX packages...', (options) =>
        this.service.getClient().list(options),
      );
      this.packages = result.packages ?? [];
    } catch (err) {
      this.packages = [];
      handleError(err);
    }

    return this.packages;
  }
}

import * as vscode from 'vscode';
import type { TpixService } from './tpix/service';
import type { PackageResponse, SearchResult } from './tpix/types';
import { handleError, specOf, workspaceCwd } from './util';
import type { CacheTreeProvider, VersionNode } from './views/cacheTree';

/** Registers every TPIX command on the extension context. */
export function registerCommands(
  context: vscode.ExtensionContext,
  service: TpixService,
  cacheTree: CacheTreeProvider,
): void {
  const register = (id: string, handler: (...args: any[]) => any): void => {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  };

  register('tpix.search', () => searchPackages(service, cacheTree));
  register('tpix.install', (spec?: string) => installPackage(service, cacheTree, spec));
  register('tpix.info', (spec?: string) => showInfo(service, cacheTree, spec));
  register('tpix.pullDependencies', () => pullDependencies(service, cacheTree));
  register('tpix.refreshCache', () => cacheTree.refresh());
  register('tpix.removeCached', (node?: VersionNode) => removeCached(service, cacheTree, node));
  register('tpix.revealPackage', (node?: VersionNode) => revealPackage(node));
  register('tpix.login', () => login(service));
  register('tpix.logout', () => logout(service));
  register('tpix.whoami', () => whoami(service));
  register('tpix.showOutput', () => service.showOutput());
}

async function searchPackages(service: TpixService, cacheTree: CacheTreeProvider): Promise<void> {
  const query = await vscode.window.showInputBox({
    title: 'Search TPIX packages',
    prompt: 'Search Typst packages on TPIX',
    placeHolder: 'e.g. cetz',
    ignoreFocusOut: true,
  });
  if (!query) {
    return;
  }

  try {
    const response = await service.withProgress(`Searching TPIX for "${query}"...`, (options) =>
      service.getClient().search(query, { ...options, limit: 50 }),
    );

    if (response.results.length === 0) {
      void vscode.window.showInformationMessage(`TPIX: no packages found for "${query}".`);
      return;
    }

    const items: Array<vscode.QuickPickItem & { result: SearchResult }> = response.results.map((result) => ({
      label: `@${result.namespace}/${result.name}`,
      description: result.latest_version,
      detail: result.description,
      result,
    }));

    const picked = await vscode.window.showQuickPick(items, {
      title: `${response.count} result(s) for "${query}"`,
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (!picked) {
      return;
    }

    await showPackageActions(service, cacheTree, `@${picked.result.namespace}/${picked.result.name}`);
  } catch (err) {
    handleError(err);
  }
}

async function showInfo(service: TpixService, cacheTree: CacheTreeProvider, spec?: string): Promise<void> {
  const target = spec ?? (await promptSpec('Package to inspect'));
  if (!target) {
    return;
  }
  await showPackageActions(service, cacheTree, target);
}

async function showPackageActions(
  service: TpixService,
  cacheTree: CacheTreeProvider,
  spec: string,
): Promise<void> {
  try {
    const info = await service.withProgress(`Fetching info for ${spec}...`, (options) =>
      service.getClient().info(spec, options),
    );

    service.log(formatPackageInfo(info));
    service.showOutput();

    const latest = info.versions[0]?.version ?? '';
    const headline = `@${info.namespace}/${info.name}${latest ? ` ${latest}` : ''} — ${info.description || 'no description'}`;

    const actions = ['Install', 'Details'];
    if (info.homepage_url) {
      actions.push('Homepage');
    }

    const choice = await vscode.window.showInformationMessage(headline, ...actions);
    if (choice === 'Install') {
      await installPackage(service, cacheTree, `@${info.namespace}/${info.name}`);
    } else if (choice === 'Homepage' && info.homepage_url) {
      void vscode.env.openExternal(vscode.Uri.parse(info.homepage_url));
    } else if (choice === 'Details') {
      service.showOutput();
    }
  } catch (err) {
    handleError(err);
  }
}

async function installPackage(
  service: TpixService,
  cacheTree: CacheTreeProvider,
  spec?: string,
): Promise<void> {
  const target = spec ?? (await promptSpec('Package to install'));
  if (!target) {
    return;
  }

  try {
    const result = await service.withProgress(`Installing ${target}...`, (options) =>
      service.getClient().get(target, options),
    );

    const downloaded = result.packages.filter((pkg) => !pkg.cached).length;
    const cached = result.resolved - downloaded;
    void vscode.window.showInformationMessage(
      `TPIX: installed ${target} — ${result.resolved} package(s) (${downloaded} downloaded, ${cached} already cached).`,
    );
    cacheTree.refresh();
  } catch (err) {
    handleError(err);
  }
}

async function pullDependencies(service: TpixService, cacheTree: CacheTreeProvider): Promise<void> {
  const cwd = workspaceCwd();
  if (!cwd) {
    void vscode.window.showWarningMessage('TPIX: open a folder before fetching project dependencies.');
    return;
  }

  try {
    const result = await service.withProgress('Resolving project dependencies...', (options) =>
      service.getClient().pull({ ...options, cwd }),
    );

    const missing = result.direct.filter((pkg) => !pkg.cached).length;
    const summary =
      result.direct.length === 0
        ? 'TPIX: no package imports found in this project.'
        : `TPIX: resolved ${result.resolved} package(s) for ${result.direct.length} direct import(s) (${missing} were missing).`;
    void vscode.window.showInformationMessage(summary);
    cacheTree.refresh();
  } catch (err) {
    handleError(err);
  }
}

async function removeCached(
  service: TpixService,
  cacheTree: CacheTreeProvider,
  node?: VersionNode,
): Promise<void> {
  const spec = node ? specOf(node.pkg) : await promptSpec('Package to remove from the cache');
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
    await service.withProgress(`Removing ${spec}...`, (options) => service.getClient().remove(spec, options));
    cacheTree.refresh();
  } catch (err) {
    handleError(err);
  }
}

async function revealPackage(node?: VersionNode): Promise<void> {
  if (!node?.pkg.path) {
    return;
  }
  await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(node.pkg.path));
}

async function login(service: TpixService): Promise<void> {
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
    await service.withProgress('Saving TPIX API key...', (options) => service.getClient().login(apiKey, options));

    try {
      const profile = await service.withProgress('Verifying credentials...', (options) =>
        service.getClient().whoami(options),
      );
      void vscode.window.showInformationMessage(`TPIX: logged in as ${profile.username}.`);
    } catch {
      void vscode.window.showWarningMessage('TPIX: API key saved but could not be verified.');
    }
  } catch (err) {
    handleError(err);
  }
}

async function logout(service: TpixService): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    'Remove the stored TPIX API key?',
    { modal: true },
    'Logout',
  );
  if (confirm !== 'Logout') {
    return;
  }

  try {
    await service.withProgress('Logging out...', (options) => service.getClient().logout(options));
    void vscode.window.showInformationMessage('TPIX: logged out.');
  } catch (err) {
    handleError(err);
  }
}

async function whoami(service: TpixService): Promise<void> {
  try {
    const profile = await service.withProgress('Fetching TPIX profile...', (options) =>
      service.getClient().whoami(options),
    );
    const namespaces = profile.namespaces.map((ns) => `${ns.name} (${ns.permission})`).join(', ');
    void vscode.window.showInformationMessage(
      `TPIX: ${profile.username} <${profile.email}>${namespaces ? ` — namespaces: ${namespaces}` : ''}`,
    );
  } catch (err) {
    handleError(err);
  }
}

async function promptSpec(prompt: string): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    prompt,
    placeHolder: '@namespace/name or @namespace/name:version',
    ignoreFocusOut: true,
    validateInput: (input) => (input.trim() ? undefined : 'Enter a package spec'),
  });
  return value?.trim() || undefined;
}

function formatPackageInfo(info: PackageResponse): string {
  const lines: string[] = [`@${info.namespace}/${info.name}`];
  if (info.description) lines.push(`  ${info.description}`);
  if (info.license) lines.push(`  license: ${info.license}`);
  if (info.authors.length) lines.push(`  authors: ${info.authors.join(', ')}`);
  if (info.categories.length) lines.push(`  categories: ${info.categories.join(', ')}`);
  if (info.updated_at) lines.push(`  updated: ${info.updated_at}`);
  if (info.homepage_url) lines.push(`  homepage: ${info.homepage_url}`);
  if (info.repository_url) lines.push(`  repository: ${info.repository_url}`);
  if (info.versions.length) {
    lines.push('  versions:');
    for (const version of info.versions.slice(0, 10)) {
      lines.push(`    ${version.version} (typst ${version.minCompilerVer || '?'})`);
    }
  }
  return lines.join('\n');
}

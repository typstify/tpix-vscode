import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { TpixService } from './tpix/service';
import { handleError, workspaceCwd } from './util';
import type { TpixViewProvider } from './views/tpixView';

export interface PackagingDeps {
  service: TpixService;
  view: TpixViewProvider;
}

/**
 * Authorship actions (bundle / publish) exposed as commands rather than as
 * parts of the browse panel: they are occasional, act on the current package
 * directory, and produce an artifact or an irreversible upload.
 */
export function registerPackagingCommands(context: vscode.ExtensionContext, deps: PackagingDeps): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('tpix.newPackage', () => newPackage(deps)),
    vscode.commands.registerCommand('tpix.bundle', () => bundlePackage(deps)),
    vscode.commands.registerCommand('tpix.publish', () => publishPackage(deps)),
  );
}

async function newPackage(deps: PackagingDeps): Promise<void> {
  const name = await vscode.window.showInputBox({
    title: 'New Typst package',
    prompt: 'Package or template name',
    ignoreFocusOut: true,
    validateInput: (value) => (/^[A-Za-z0-9_-]+$/.test(value.trim()) ? undefined : 'Use letters, digits, "-" or "_"'),
  });
  if (!name) {
    return;
  }

  const namespace = await vscode.window.showInputBox({
    title: 'Namespace',
    prompt: 'Namespace the package belongs to',
    value: 'preview',
    ignoreFocusOut: true,
  });
  if (!namespace) {
    return;
  }

  const kind = await vscode.window.showQuickPick(['Library package', 'Template'], { title: 'Package kind' });
  if (!kind) {
    return;
  }

  const directory = workspaceCwd() ?? (await pickDirectory('Select a destination directory'));
  if (!directory) {
    return;
  }

  try {
    const result = await deps.service.withProgress('Creating package...', (options) =>
      deps.service.getClient().newPackage(name.trim(), {
        ...options,
        directory,
        namespace,
        template: kind === 'Template',
      }),
    );

    deps.view.log(`Created ${result.packageDir}.`);
    const choice = await vscode.window.showInformationMessage(`TPIX: created ${result.packageDir}`, 'Open Folder');
    if (choice === 'Open Folder') {
      await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(result.packageDir), {
        forceNewWindow: true,
      });
    }
  } catch (err) {
    fail(deps, err);
  }
}

async function bundlePackage(deps: PackagingDeps, directory?: string): Promise<void> {
  const dir = directory ?? (await pickPackageDirectory());
  if (!dir) {
    return;
  }

  try {
    const result = await deps.service.withProgress('Bundling Typst package...', (options) =>
      deps.service.getClient().bundle(dir, options),
    );

    deps.view.log(`Bundled ${result.outputPath}.`);
    const choice = await vscode.window.showInformationMessage(
      `TPIX: created ${result.outputPath}`,
      'Reveal',
      'Publish',
    );
    if (choice === 'Reveal') {
      await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(result.outputPath));
    } else if (choice === 'Publish') {
      // Reuse the artifact we just built instead of bundling again.
      await publishPackage(deps, dir, result.outputPath);
    }
  } catch (err) {
    fail(deps, err);
  }
}

async function publishPackage(deps: PackagingDeps, directory?: string, artifactPath?: string): Promise<void> {
  const dir = directory ?? (await pickPackageDirectory());
  if (!dir) {
    return;
  }

  // When publishing directly, bundle into a throwaway temp file so no artifact
  // is left behind in the project. An artifact passed in (from the Bundle
  // command) is reused and kept.
  const temporary = !artifactPath;
  let artifact =
    artifactPath ??
    path.join(
      os.tmpdir(),
      `tpix-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.tar.gz`,
    );

  try {
    if (temporary) {
      const bundle = await deps.service.withProgress('Bundling Typst package...', (options) =>
        deps.service.getClient().bundle(dir, { ...options, output: artifact }),
      );
      artifact = bundle.outputPath;
    }

    const namespace = await pickNamespace(deps.service);
    if (!namespace) {
      return;
    }

    const result = await deps.service.withProgress(`Uploading to ${namespace}...`, (options) =>
      deps.service.getClient().push(artifact, namespace, options),
    );

    if (result.success) {
      deps.view.log(`Published @${result.namespace}/${result.package}:${result.version}.`);
      void vscode.window.showInformationMessage(
        `TPIX: published @${result.namespace}/${result.package}:${result.version}.`,
      );
      return;
    }

    deps.view.log(`Package validation failed for ${dir}:`, 'error');
    for (const line of result.report ?? []) {
      deps.view.log(`  ${line}`, 'error');
    }
    void vscode.window.showErrorMessage(
      'TPIX: package validation failed. See the TPIX sidebar (Activity) for details.',
    );
  } catch (err) {
    fail(deps, err);
  } finally {
    if (temporary) {
      await fs.promises.rm(artifact, { force: true }).catch(() => undefined);
    }
  }
}

async function pickNamespace(service: TpixService): Promise<string | undefined> {
  let namespaces: string[] = [];
  try {
    const profile = await service.withProgress('Fetching namespaces...', (options) =>
      service.getClient().whoami(options),
    );
    namespaces = profile.namespaces.map((ns) => ns.name);
  } catch {
    // Not logged in or profile unavailable: fall back to manual input.
  }

  if (namespaces.length > 0) {
    return vscode.window.showQuickPick(namespaces, {
      title: 'Publish to namespace',
      placeHolder: 'Select a namespace',
    });
  }

  return vscode.window.showInputBox({
    title: 'Publish to namespace',
    prompt: 'Namespace to publish to',
    ignoreFocusOut: true,
  });
}

/**
 * Locates the package directory to operate on. It never guesses: when several
 * packages exist it asks which one.
 *
 *  1. the nearest `typst.toml` above the active file (within its workspace folder),
 *  2. otherwise every `typst.toml` in the workspace — a QuickPick when there is
 *     more than one,
 *  3. otherwise a folder picker.
 */
async function pickPackageDirectory(): Promise<string | undefined> {
  const fromActiveFile = packageFromActiveFile();
  if (fromActiveFile) {
    return fromActiveFile;
  }

  const candidates = await findWorkspacePackages();
  if (candidates.length === 1) {
    return candidates[0];
  }
  if (candidates.length > 1) {
    return pickPackage(candidates);
  }

  return pickDirectory('Select the package directory (containing typst.toml)');
}

function packageFromActiveFile(): string | undefined {
  const active = vscode.window.activeTextEditor?.document.uri;
  if (!active || active.scheme !== 'file') {
    return undefined;
  }

  const folder = vscode.workspace.getWorkspaceFolder(active);
  const stopDir = folder && folder.uri.scheme === 'file' ? folder.uri.fsPath : undefined;
  return findManifestUpward(path.dirname(active.fsPath), stopDir);
}

function findManifestUpward(startDir: string, stopDir?: string): string | undefined {
  let dir = startDir;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'typst.toml'))) {
      return dir;
    }
    if (stopDir && dir === stopDir) {
      return undefined;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

async function findWorkspacePackages(): Promise<string[]> {
  const manifests = await vscode.workspace.findFiles(
    '**/typst.toml',
    '**/node_modules/**',
    100,
  );
  const dirs = new Set<string>();
  for (const uri of manifests) {
    if (uri.scheme === 'file') {
      dirs.add(path.dirname(uri.fsPath));
    }
  }
  return [...dirs].sort();
}

async function pickPackage(candidates: string[]): Promise<string | undefined> {
  const items: Array<vscode.QuickPickItem & { dir: string }> = candidates.map((dir) => ({
    label: path.basename(dir),
    description: vscode.workspace.asRelativePath(dir, false),
    detail: dir,
    dir,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Select a package',
    placeHolder: 'Several packages were found in this workspace',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  return picked?.dir;
}

async function pickDirectory(openLabel: string): Promise<string | undefined> {
  const cwd = workspaceCwd();
  const picked = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel,
    defaultUri: cwd ? vscode.Uri.file(cwd) : undefined,
  });
  return picked?.[0]?.fsPath;
}

function fail(deps: PackagingDeps, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  deps.view.log(message, 'error');
  handleError(err);
}

import { spawn } from 'node:child_process';
import { TpixError, type TpixErrorDetail } from './errors';
import type {
  BundleResult,
  CachedListResult,
  DependencyGraphResult,
  GetResult,
  LoginResult,
  LogoutResult,
  NewPackageResult,
  PackageResponse,
  PullResult,
  PushResult,
  RemoveResult,
  SearchResponse,
  VersionResult,
  WhoamiResult,
} from './types';

/** Options that affect how a single CLI invocation is run. */
export interface TpixRunOptions {
  /** Working directory for the process. */
  cwd?: string;
  /** Environment for the process. */
  env?: NodeJS.ProcessEnv;
  /** Cancels the invocation when aborted. */
  signal?: AbortSignal;
  /** Receives human-readable progress lines emitted on the CLI's stderr. */
  onProgress?: (line: string) => void;
}

export interface TpixClientOptions {
  /** Path to the tpix binary, or a bare command resolved via PATH. */
  binaryPath: string;
  /** Default working directory. */
  cwd?: string;
  /** Default environment. */
  env?: NodeJS.ProcessEnv;
}

export interface SearchOptions extends TpixRunOptions {
  namespace?: string;
  kind?: 'all' | 'pkg' | 'template';
  category?: string;
  sort?: 'name' | 'updated' | 'popularity';
  limit?: number;
}

export interface GetOptions extends TpixRunOptions {
  /** Skip transitive dependencies. */
  noDeps?: boolean;
}

export interface PullOptions extends TpixRunOptions {
  /** Discover dependencies without downloading. */
  dryRun?: boolean;
}

export interface BundleOptions extends TpixRunOptions {
  output?: string;
  exclude?: string[];
}

export interface NewPackageOptions extends TpixRunOptions {
  /** Destination directory (`--dest`). */
  directory?: string;
  /** Namespace (`--namespace`). */
  namespace?: string;
  /** Create a template instead of a library (`--template`). */
  template?: boolean;
}

interface RunOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

interface Envelope {
  schemaVersion: number;
  type: 'result' | 'error';
  command: string;
  data?: unknown;
  error?: TpixErrorDetail;
}

/**
 * Thin, typed wrapper around the tpix CLI's `--json` interface.
 *
 * The CLI writes exactly one JSON document to stdout (the result or an error
 * envelope) and all human progress to stderr. This client never parses stdout
 * as anything else.
 *
 * This module deliberately has no dependency on the `vscode` module so it can
 * be unit-tested and reused.
 */
export class TpixClient {
  constructor(private readonly options: TpixClientOptions) {}

  get binaryPath(): string {
    return this.options.binaryPath;
  }

  /** Runs an arbitrary tpix command and returns its `data` payload. */
  async run<T>(args: string[], options: TpixRunOptions = {}): Promise<T> {
    const { stdout, stderr, exitCode } = await this.spawn([...args, '--json'], options);

    const envelope = parseEnvelope(stdout);

    if (envelope?.type === 'error') {
      throw new TpixError(envelope.error ?? { code: exitCode ?? 1, message: 'unknown tpix error' }, {
        exitCode: exitCode ?? undefined,
        stderr,
      });
    }

    if (exitCode !== 0) {
      throw new TpixError(
        { code: exitCode ?? 1, message: stderr.trim() || `tpix exited with code ${exitCode}` },
        { exitCode: exitCode ?? undefined, stderr },
      );
    }

    if (!envelope || envelope.type !== 'result') {
      throw new TpixError(
        { code: 1, message: 'tpix produced no JSON result' },
        { exitCode: exitCode ?? undefined, stderr },
      );
    }

    return envelope.data as T;
  }

  version(options?: TpixRunOptions): Promise<VersionResult> {
    return this.run(['version'], options);
  }

  cachePath(options?: TpixRunOptions): Promise<{ path: string; source: string }> {
    return this.run(['cache-path'], options);
  }

  search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const args = ['search', query];
    if (options.namespace) args.push('--namespace', options.namespace);
    if (options.kind) args.push('--kind', options.kind);
    if (options.category) args.push('--category', options.category);
    if (options.sort) args.push('--sort', options.sort);
    if (options.limit !== undefined) args.push('--limit', String(options.limit));
    return this.run(args, options);
  }

  info(spec: string, options?: TpixRunOptions): Promise<PackageResponse> {
    return this.run(['info', spec], options);
  }

  deps(spec: string, options?: TpixRunOptions): Promise<DependencyGraphResult> {
    return this.run(['deps', spec], options);
  }

  get(spec: string, options: GetOptions = {}): Promise<GetResult> {
    const args = ['get', spec];
    if (options.noDeps) args.push('--no-deps');
    return this.run(args, options);
  }

  pull(options: PullOptions = {}): Promise<PullResult> {
    const args = ['pull'];
    if (options.dryRun) args.push('--dry-run');
    return this.run(args, options);
  }

  list(options?: TpixRunOptions): Promise<CachedListResult> {
    return this.run(['list'], options);
  }

  remove(spec: string, options?: TpixRunOptions): Promise<RemoveResult> {
    return this.run(['remove', spec], options);
  }

  bundle(directory: string, options: BundleOptions = {}): Promise<BundleResult> {
    const args = ['bundle', directory];
    if (options.output) args.push('--output', options.output);
    for (const pattern of options.exclude ?? []) {
      args.push('--exclude', pattern);
    }
    return this.run(args, options);
  }

  push(packageFile: string, namespace: string, options?: TpixRunOptions): Promise<PushResult> {
    return this.run(['push', packageFile, namespace], options);
  }

  newPackage(name: string, options: NewPackageOptions = {}): Promise<NewPackageResult> {
    const args = ['new', name];
    if (options.directory) args.push('--dest', options.directory);
    if (options.namespace) args.push('--namespace', options.namespace);
    if (options.template) args.push('--template');
    return this.run(args, options);
  }

  login(apiKey: string, options?: TpixRunOptions): Promise<LoginResult> {
    return this.run(['login', '-k', apiKey], options);
  }

  logout(options?: TpixRunOptions): Promise<LogoutResult> {
    return this.run(['logout'], options);
  }

  whoami(options?: TpixRunOptions): Promise<WhoamiResult> {
    return this.run(['whoami'], options);
  }

  private spawn(args: string[], options: TpixRunOptions): Promise<RunOutput> {
    return new Promise<RunOutput>((resolve, reject) => {
      const child = spawn(this.options.binaryPath, args, {
        cwd: options.cwd ?? this.options.cwd,
        env: options.env ?? this.options.env ?? process.env,
      });

      let stdout = '';
      let stderr = '';
      let stderrBuffer = '';
      let aborted = false;

      const onAbort = (): void => {
        aborted = true;
        child.kill();
      };
      options.signal?.addEventListener('abort', onAbort, { once: true });

      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk;
      });

      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (chunk: string) => {
        stderr += chunk;
        stderrBuffer += chunk;
        let newline: number;
        while ((newline = stderrBuffer.indexOf('\n')) >= 0) {
          const line = stderrBuffer.slice(0, newline);
          stderrBuffer = stderrBuffer.slice(newline + 1);
          if (line.trim()) {
            options.onProgress?.(line);
          }
        }
      });

      child.on('error', (err) => {
        options.signal?.removeEventListener('abort', onAbort);
        reject(
          new TpixError(
            { code: 1, message: `failed to run tpix (${this.options.binaryPath}): ${err.message}` },
            { stderr },
          ),
        );
      });

      child.on('close', (exitCode) => {
        options.signal?.removeEventListener('abort', onAbort);
        if (aborted) {
          reject(new TpixError({ code: 1, message: 'tpix invocation was cancelled' }, { stderr }));
          return;
        }
        resolve({ stdout, stderr, exitCode });
      });
    });
  }
}

/** Parses the single JSON document the CLI writes to stdout. */
export function parseEnvelope(stdout: string): Envelope | undefined {
  const text = stdout.trim();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as Envelope;
  } catch {
    // Be defensive: accept a trailing JSON document if anything prefixed stdout.
    const lastLine = text.split(/\r?\n/).filter((line) => line.trim()).pop();
    if (lastLine) {
      try {
        return JSON.parse(lastLine) as Envelope;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

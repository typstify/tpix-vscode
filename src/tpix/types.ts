/**
 * Type definitions mirroring the tpix CLI `--json` output schema (schemaVersion 1).
 *
 * Field names are snake_case where the CLI reuses the server's JSON models
 * (search/info), and camelCase for CLI-defined payloads. Keep this file in sync
 * with tpix-cli/docs/json-output.md.
 */

/** Schema version this client understands. */
export const TPIX_SCHEMA_VERSION = 1;

/** A package reference: `@namespace/name:version`. */
export interface PackageRef {
  namespace: string;
  name: string;
  version: string;
}

/** A package resolved by a fetch operation. */
export interface ResolvedPackage extends PackageRef {
  /** True when the package was already present in the local cache. */
  cached: boolean;
}

/** A package present in the local cache. */
export interface CachedPackage extends PackageRef {
  /** Absolute path of the package inside the cache, when available. */
  path?: string;
}

export interface SearchResult {
  name: string;
  namespace: string;
  description: string;
  latest_version: string;
  published_at: string;
  license: string;
  is_template: boolean;
  authors: string[];
  categories: string[];
  disciplines: string[];
  thumbnail: string;
  created_at: string;
}

export interface SearchResponse {
  query: string;
  total: number;
  count: number;
  results: SearchResult[];
}

export interface PackageVersionInfo {
  version: string;
  minCompilerVer: string;
  sha256: string;
  published_at: string;
}

export interface PackageResponse {
  id: string;
  name: string;
  namespace: string;
  source_type: string;
  external_url: string;
  description: string;
  homepage_url: string;
  repository_url: string;
  authors: string[];
  keywords: string[];
  categories: string[];
  disciplines: string[];
  license: string;
  is_template: boolean;
  thumbnail: string;
  last_published_at: string;
  created_at: string;
  updated_at: string;
  versions: PackageVersionInfo[];
}

export interface GetResult {
  requested: string;
  packages: ResolvedPackage[];
  resolved: number;
}

export interface PullResult {
  projectDir: string;
  dryRun: boolean;
  direct: ResolvedPackage[];
  packages: ResolvedPackage[];
  resolved: number;
}

export interface CachedListResult {
  cachePath: string;
  packages: CachedPackage[];
  total: number;
}

export interface RemoveResult {
  removed: PackageRef;
}

export interface BundleResult {
  sourceDir: string;
  outputPath: string;
}

export interface PushResult {
  namespace: string;
  package: string;
  version: string;
  sha256?: string;
  size?: number;
  success: boolean;
  report?: string[];
}

export interface LoginResult {
  success: boolean;
}

export interface LogoutResult {
  success: boolean;
}

export interface UserNamespace {
  name: string;
  permission: string;
}

export interface WhoamiResult {
  username: string;
  email: string;
  created_at: string;
  namespaces: UserNamespace[];
}

export interface VersionResult {
  version: string;
  schemaVersion: number;
  hasUpdate: boolean;
  latest?: string;
}

export interface NewPackageResult {
  packageDir: string;
}

/** A node in a resolved dependency tree. */
export interface DependencyNodeDto {
  package: PackageRef;
  cached: boolean;
  children?: DependencyNodeDto[];
}

/** Result of `tpix deps <spec>`. */
export interface DependencyGraphResult {
  root: DependencyNodeDto;
  packages: ResolvedPackage[];
}

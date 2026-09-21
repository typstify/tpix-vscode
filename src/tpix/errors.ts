/**
 * Error type and exit codes for the tpix CLI.
 *
 * Exit codes are part of the CLI's machine contract; see
 * tpix-cli/docs/json-output.md.
 */

export const TpixExitCode = {
  OK: 0,
  GENERIC: 1,
  USAGE: 2,
  AUTH: 3,
  NOT_FOUND: 4,
  NETWORK: 5,
  VALIDATION: 6,
} as const;

export type TpixExitCodeValue = (typeof TpixExitCode)[keyof typeof TpixExitCode];

/** The `error` object of a tpix error document. */
export interface TpixErrorDetail {
  code: number;
  httpStatus?: number;
  message: string;
  description?: string;
}

/** Raised when a tpix invocation fails. */
export class TpixError extends Error {
  /** Stable exit code (see {@link TpixExitCode}). */
  readonly code: number;
  /** HTTP status when the failure came from the TPIX server. */
  readonly httpStatus?: number;
  /** Longer description from the server, when present. */
  readonly description?: string;
  /** Process exit code, when the CLI produced one. */
  readonly exitCode?: number;
  /** Raw stderr, useful for diagnostics. */
  readonly stderr?: string;

  constructor(detail: TpixErrorDetail, options: { exitCode?: number; stderr?: string } = {}) {
    super(detail.message);
    this.name = 'TpixError';
    this.code = detail.code;
    this.httpStatus = detail.httpStatus;
    this.description = detail.description;
    this.exitCode = options.exitCode;
    this.stderr = options.stderr;
  }

  get isAuthError(): boolean {
    return this.code === TpixExitCode.AUTH;
  }

  get isNotFound(): boolean {
    return this.code === TpixExitCode.NOT_FOUND;
  }

  get isUsageError(): boolean {
    return this.code === TpixExitCode.USAGE;
  }

  get isNetworkError(): boolean {
    return this.code === TpixExitCode.NETWORK;
  }
}

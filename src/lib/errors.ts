export type AppErrorCode =
  | "configuration_error"
  | "unauthorized"
  | "validation_error"
  | "connect_required"
  | "reconnect_required"
  | "meta_api_error"
  | "internal_error";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(
    code: AppErrorCode,
    message: string,
    options?: {
      status?: number;
      details?: unknown;
      cause?: unknown;
    }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.status = options?.status ?? 500;
    this.details = options?.details;
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("configuration_error", message, { status: 500, details });
    this.name = "ConfigurationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", details?: unknown) {
    super("unauthorized", message, { status: 401, details });
    this.name = "UnauthorizedError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("validation_error", message, { status: 400, details });
    this.name = "ValidationError";
  }
}

export class ConnectionRequiredError extends AppError {
  constructor(message = "Connect a Meta account for this workspace first.") {
    super("connect_required", message, { status: 401 });
    this.name = "ConnectionRequiredError";
  }
}

export class ReconnectRequiredError extends AppError {
  constructor(
    message = "Reconnect the Meta account for this workspace before retrying."
  ) {
    super("reconnect_required", message, { status: 401 });
    this.name = "ReconnectRequiredError";
  }
}

export class MetaApiError extends AppError {
  readonly httpStatus?: number;
  readonly metaCode?: number;
  readonly metaSubcode?: number;
  readonly fbTraceId?: string;

  constructor(
    message: string,
    options?: {
      httpStatus?: number;
      metaCode?: number;
      metaSubcode?: number;
      fbTraceId?: string;
      details?: unknown;
      cause?: unknown;
    }
  ) {
    super("meta_api_error", message, {
      status: options?.httpStatus ?? 502,
      details: options?.details,
      cause: options?.cause,
    });
    this.name = "MetaApiError";
    this.httpStatus = options?.httpStatus;
    this.metaCode = options?.metaCode;
    this.metaSubcode = options?.metaSubcode;
    this.fbTraceId = options?.fbTraceId;
  }
}

export function normalizeAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    if (error instanceof MetaApiError && error.metaCode === 190) {
      return new ReconnectRequiredError(
        "The stored Meta access token is expired or invalid. Reconnect the workspace."
      );
    }
    return error;
  }

  if (error instanceof Error) {
    return new AppError("internal_error", error.message, {
      status: 500,
      cause: error,
    });
  }

  return new AppError("internal_error", "Unexpected internal error.");
}

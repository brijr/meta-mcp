import { ConfigurationError } from "../errors";

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: {
      expirationTtl?: number;
    }
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface AppBindings {
  META_DB?: D1DatabaseLike;
  META_OAUTH_STATE?: KVNamespaceLike;
  JWT_SECRET?: string;
  JWT_JWKS_URL?: string;
  JWT_ISSUER?: string;
  JWT_AUDIENCE?: string;
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  META_REDIRECT_URI?: string;
  META_GRAPH_VERSION?: string;
  META_TOKEN_ENCRYPTION_KEY?: string;
  META_OAUTH_SCOPES?: string;
  META_OAUTH_ALLOWED_RETURN_ORIGINS?: string;
}

let bindingsOverride: AppBindings | undefined;

export function setBindingsForTests(bindings?: AppBindings) {
  bindingsOverride = bindings;
}

export function getBindings(): AppBindings {
  return (
    bindingsOverride ??
    globalThis.__META_ADS_BINDINGS__ ??
    {}
  ) as AppBindings;
}

export function getRequiredBinding<K extends keyof AppBindings>(
  key: K
): NonNullable<AppBindings[K]> {
  const value = getBindings()[key];
  if (value === undefined || value === null || value === "") {
    throw new ConfigurationError(`Missing required binding: ${String(key)}`);
  }

  return value as NonNullable<AppBindings[K]>;
}

export function getMetaGraphVersion(): string {
  return getBindings().META_GRAPH_VERSION || "v25.0";
}

export function getMetaOAuthScopes(): string[] {
  const raw = getBindings().META_OAUTH_SCOPES;
  if (!raw) {
    return ["ads_management", "business_management"];
  }

  return raw
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}

export function getMetaOAuthAllowedReturnOrigins(): string[] {
  const raw = getBindings().META_OAUTH_ALLOWED_RETURN_ORIGINS;
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

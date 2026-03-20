import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import {
  ConfigurationError,
  UnauthorizedError,
  ValidationError,
} from "../errors";
import { getBindings } from "../runtime/env";

export interface AuthInfo {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt?: number;
  extra?: Record<string, unknown>;
}

const encoder = new TextEncoder();
let remoteJwks:
  | ReturnType<typeof createRemoteJWKSet>
  | undefined;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return [];
}

function extractWorkspaceId(payload: JWTPayload): string | null {
  const claims = payload as JWTPayload & {
    workspaceId?: unknown;
    workspace_id?: unknown;
  };
  return asString(claims.workspaceId) ?? asString(claims.workspace_id);
}

function extractUserId(payload: JWTPayload): string | null {
  const claims = payload as JWTPayload & {
    userId?: unknown;
    user_id?: unknown;
  };
  return asString(payload.sub) ?? asString(claims.userId) ?? asString(claims.user_id);
}

function resolveClientId(payload: JWTPayload): string {
  const claims = payload as JWTPayload & {
    client_id?: unknown;
  };
  return (
    asString(payload.azp) ??
    asString(claims.client_id) ??
    asString(Array.isArray(payload.aud) ? payload.aud[0] : payload.aud) ??
    "unknown-client"
  );
}

export function extractBearerToken(request: Request): string {
  const header = request.headers.get("authorization");
  const [scheme, token] = header?.split(" ") ?? [];

  if (!header || !scheme || scheme.toLowerCase() !== "bearer" || !token) {
    throw new UnauthorizedError(
      "Missing or malformed Authorization bearer token."
    );
  }

  return token.trim();
}

export async function verifyBearerJwt(token: string): Promise<AuthInfo> {
  const bindings = getBindings();
  const issuer = bindings.JWT_ISSUER;
  const audience = bindings.JWT_AUDIENCE;
  let payload: JWTPayload;

  try {
    if (bindings.JWT_JWKS_URL) {
      remoteJwks ??= createRemoteJWKSet(new URL(bindings.JWT_JWKS_URL));
      ({ payload } = await jwtVerify(token, remoteJwks, {
        issuer,
        audience,
      }));
    } else if (bindings.JWT_SECRET) {
      ({ payload } = await jwtVerify(token, encoder.encode(bindings.JWT_SECRET), {
        issuer,
        audience,
      }));
    } else {
      throw new ConfigurationError(
        "Configure JWT_SECRET or JWT_JWKS_URL to protect /mcp requests."
      );
    }
  } catch (error) {
    throw new UnauthorizedError("Invalid or expired bearer token.", {
      cause: error,
    });
  }

  const userId = extractUserId(payload);
  const workspaceId = extractWorkspaceId(payload);
  if (!userId || !workspaceId) {
    throw new ValidationError(
      "JWT payload must include sub/userId and workspaceId claims."
    );
  }

  return {
    token,
    clientId: resolveClientId(payload),
    scopes: normalizeStringArray(
      payload.scope ?? (payload as JWTPayload & { scopes?: unknown }).scopes
    ),
    expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
    extra: {
      userId,
      workspaceId,
      roles: normalizeStringArray(
        (payload as JWTPayload & { roles?: unknown }).roles
      ),
    },
  };
}

export async function authenticateRequest(request: Request): Promise<AuthInfo> {
  const token = extractBearerToken(request);
  return verifyBearerJwt(token);
}

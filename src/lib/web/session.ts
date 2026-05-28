import { SignJWT, jwtVerify } from "jose";
import { UnauthorizedError, ConfigurationError } from "../errors";
import { getBindings } from "../runtime/env";

const encoder = new TextEncoder();

export const APP_SESSION_COOKIE_NAME = "meta_mcp_app_session";
const APP_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface AppSession {
  userId: string;
  workspaceId: string;
}

function parseCookies(header: string | null): Record<string, string> {
  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf("=");
        const key = separatorIndex >= 0 ? part.slice(0, separatorIndex) : part;
        const value = separatorIndex >= 0 ? part.slice(separatorIndex + 1) : "";
        return [key, decodeURIComponent(value)];
      })
  );
}

function getSessionSecret(): Uint8Array {
  const raw = getBindings().APP_SESSION_SECRET || getBindings().JWT_SECRET;
  if (!raw) {
    throw new ConfigurationError(
      "Configure APP_SESSION_SECRET or JWT_SECRET to enable the admin app."
    );
  }

  return encoder.encode(raw);
}

function constantTimeEquals(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length === right.length ? 0 : 1;

  for (let index = 0; index < maxLength; index += 1) {
    mismatch |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return mismatch === 0;
}

export function getAppUiPassword(): string | null {
  const value = getBindings().APP_UI_PASSWORD;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getAppUiWorkspaceId(): string {
  return getBindings().APP_UI_WORKSPACE_ID || "workspace_admin";
}

export function getAppUiUserId(): string {
  return getBindings().APP_UI_USER_ID || "app_admin";
}

export function createDefaultAppSession(): AppSession {
  return {
    userId: getAppUiUserId(),
    workspaceId: getAppUiWorkspaceId(),
  };
}

export function verifyAppUiPassword(candidate: string): boolean {
  const password = getAppUiPassword();
  if (!password) {
    throw new ConfigurationError(
      "Configure APP_UI_PASSWORD before using the admin app."
    );
  }

  return constantTimeEquals(password, candidate);
}

export async function createAppSessionToken(
  session: AppSession
): Promise<string> {
  return new SignJWT({
    workspaceId: session.workspaceId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "app-session" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(`${APP_SESSION_TTL_SECONDS}s`)
    .sign(getSessionSecret());
}

export async function createAppSessionCookie(
  session: AppSession
): Promise<string> {
  const token = await createAppSessionToken(session);
  return [
    `${APP_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${APP_SESSION_TTL_SECONDS}`,
  ].join("; ");
}

export function clearAppSessionCookie(): string {
  return [
    `${APP_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

export async function getAppSession(request: Request): Promise<AppSession | null> {
  const token = parseCookies(request.headers.get("cookie"))[APP_SESSION_COOKIE_NAME];
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    const workspaceId =
      typeof payload.workspaceId === "string" ? payload.workspaceId : null;
    const userId = typeof payload.sub === "string" ? payload.sub : null;

    if (!workspaceId || !userId) {
      return null;
    }

    return {
      userId,
      workspaceId,
    };
  } catch {
    return null;
  }
}

export async function requireAppSession(request: Request): Promise<AppSession> {
  const session = await getAppSession(request);
  if (!session) {
    throw new UnauthorizedError("Log in to the admin app first.");
  }

  return session;
}

import type { WebMiddleware } from "xmcp/cloudflare";
import { authenticateRequest } from "./lib/auth/jwt";
import { normalizeAppError, UnauthorizedError } from "./lib/errors";
import {
  handleMetaOAuthCallback,
  handleMetaOAuthStart,
} from "./lib/oauth/meta-oauth";

function jsonErrorResponse(error: unknown): Response {
  const normalized = normalizeAppError(error);
  return new Response(
    JSON.stringify({
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
      },
    }),
    {
      status: normalized.status,
      headers: {
        "content-type": "application/json",
      },
    }
  );
}

const metaOAuthMiddleware: WebMiddleware = async (request) => {
  const url = new URL(request.url);

  if (url.pathname === "/oauth/meta/start") {
    try {
      return await handleMetaOAuthStart(request);
    } catch (error) {
      return jsonErrorResponse(error);
    }
  }

  if (url.pathname === "/oauth/meta/callback") {
    try {
      return await handleMetaOAuthCallback(request);
    } catch (error) {
      return jsonErrorResponse(error);
    }
  }

  return undefined;
};

const mcpJwtMiddleware: WebMiddleware = async (request, context) => {
  const url = new URL(request.url);
  if (url.pathname !== "/mcp") {
    return undefined;
  }

  try {
    const authInfo = await authenticateRequest(request);
    context.setAuth(authInfo);
    return undefined;
  } catch (error) {
    return jsonErrorResponse(
      error instanceof UnauthorizedError
        ? error
        : new UnauthorizedError("Unable to authenticate this MCP request.")
    );
  }
};

export default [metaOAuthMiddleware, mcpJwtMiddleware];

import { authenticateRequest } from "../auth/jwt";
import { UnauthorizedError, ValidationError } from "../errors";
import { MetaGraphClient } from "../meta/client";
import {
  getBindings,
  getMetaOAuthAllowedReturnOrigins,
  getMetaGraphVersion,
  getMetaOAuthScopes,
  getRequiredBinding,
} from "../runtime/env";
import { upsertMetaConnection } from "../storage/connection-repo";

const STATE_TTL_SECONDS = 600;

interface MetaOAuthState {
  userId: string;
  workspaceId: string;
  returnTo: string | null;
}

function getRedirectUri(request: Request): string {
  const configured = getBindings().META_REDIRECT_URI;
  if (configured) {
    return configured;
  }

  return new URL("/oauth/meta/callback", request.url).toString();
}

function normalizeReturnTo(request: Request, raw: string | null): string | null {
  if (!raw) {
    return null;
  }

  const requestUrl = new URL(request.url);
  const allowedOrigins = new Set<string>([
    requestUrl.origin,
    ...getMetaOAuthAllowedReturnOrigins(),
  ]);

  try {
    const parsed = new URL(raw, requestUrl.origin);
    if (!allowedOrigins.has(parsed.origin)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function appendQueryValue(url: string, key: string, value: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(key, value);
  return parsed.toString();
}

async function persistState(state: string, payload: MetaOAuthState) {
  const kv = getRequiredBinding("META_OAUTH_STATE");
  await kv.put(state, JSON.stringify(payload), {
    expirationTtl: STATE_TTL_SECONDS,
  });
}

async function consumeState(state: string): Promise<MetaOAuthState> {
  const kv = getRequiredBinding("META_OAUTH_STATE");
  const stored = await kv.get(state);
  if (!stored) {
    throw new ValidationError("The Meta OAuth state is missing or expired.");
  }

  await kv.delete(state);
  return JSON.parse(stored) as MetaOAuthState;
}

async function exchangeMetaCodeForToken(request: Request, code: string) {
  const appId = getRequiredBinding("META_APP_ID");
  const appSecret = getRequiredBinding("META_APP_SECRET");
  const redirectUri = getRedirectUri(request);
  const version = getMetaGraphVersion();

  const shortLivedUrl = new URL(
    `https://graph.facebook.com/${version}/oauth/access_token`
  );
  shortLivedUrl.searchParams.set("client_id", appId);
  shortLivedUrl.searchParams.set("client_secret", appSecret);
  shortLivedUrl.searchParams.set("redirect_uri", redirectUri);
  shortLivedUrl.searchParams.set("code", code);

  const shortResponse = await fetch(shortLivedUrl);
  const shortJson = (await shortResponse.json()) as {
    access_token: string;
    expires_in?: number;
    error?: { message?: string };
  };

  if (!shortResponse.ok || !shortJson.access_token) {
    throw new ValidationError(
      shortJson.error?.message ?? "Meta did not return an access token."
    );
  }

  const longLivedUrl = new URL(
    `https://graph.facebook.com/${version}/oauth/access_token`
  );
  longLivedUrl.searchParams.set("grant_type", "fb_exchange_token");
  longLivedUrl.searchParams.set("client_id", appId);
  longLivedUrl.searchParams.set("client_secret", appSecret);
  longLivedUrl.searchParams.set("fb_exchange_token", shortJson.access_token);

  const longResponse = await fetch(longLivedUrl);
  const longJson = (await longResponse.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (longResponse.ok && longJson.access_token) {
    return {
      accessToken: longJson.access_token,
      expiresAt:
        typeof longJson.expires_in === "number"
          ? Math.floor(Date.now() / 1000) + longJson.expires_in
          : null,
    };
  }

  return {
    accessToken: shortJson.access_token,
    expiresAt:
      typeof shortJson.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + shortJson.expires_in
        : null,
  };
}

async function fetchGraphUser(accessToken: string) {
  const client = new MetaGraphClient(accessToken);
  return client.get<{ id: string; name?: string }>("me", {
    fields: "id,name",
  });
}

export async function handleMetaOAuthStart(request: Request): Promise<Response> {
  const auth = await authenticateRequest(request);
  const authExtra = auth.extra as Record<string, unknown> | undefined;
  const workspaceId = request.headers.get("x-workspace-id") ??
    new URL(request.url).searchParams.get("workspace_id");

  if (!authExtra?.workspaceId || workspaceId !== authExtra.workspaceId) {
    throw new UnauthorizedError(
      "The requested workspace does not match the authenticated token."
    );
  }

  const state = crypto.randomUUID();
  const returnTo = normalizeReturnTo(
    request,
    new URL(request.url).searchParams.get("return_to")
  );
  await persistState(state, {
    userId: String(authExtra.userId),
    workspaceId: String(authExtra.workspaceId),
    returnTo,
  });

  const authorizeUrl = new URL("https://www.facebook.com/dialog/oauth");
  authorizeUrl.searchParams.set("client_id", getRequiredBinding("META_APP_ID"));
  authorizeUrl.searchParams.set("redirect_uri", getRedirectUri(request));
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", getMetaOAuthScopes().join(","));

  return Response.redirect(authorizeUrl.toString(), 302);
}

export async function handleMetaOAuthCallback(
  request: Request
): Promise<Response> {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  if (!state) {
    throw new ValidationError("Meta OAuth callback is missing the state.");
  }

  const statePayload = await consumeState(state);
  if (error) {
    if (statePayload.returnTo) {
      return Response.redirect(
        appendQueryValue(
          appendQueryValue(statePayload.returnTo, "meta_oauth", "error"),
          "message",
          errorDescription ?? error
        ),
        302
      );
    }

    return new Response(errorDescription ?? error, { status: 400 });
  }

  if (!code) {
    throw new ValidationError("Meta OAuth callback is missing the code.");
  }

  const tokenPayload = await exchangeMetaCodeForToken(request, code);
  const graphUser = await fetchGraphUser(tokenPayload.accessToken);
  await upsertMetaConnection({
    workspaceId: statePayload.workspaceId,
    userId: statePayload.userId,
    accessToken: tokenPayload.accessToken,
    expiresAt: tokenPayload.expiresAt,
    scopes: getMetaOAuthScopes(),
    graphUserId: graphUser.id,
    graphUserName: graphUser.name ?? null,
  });

  if (statePayload.returnTo) {
    return Response.redirect(
      appendQueryValue(statePayload.returnTo, "meta_oauth", "connected"),
      302
    );
  }

  return new Response("Meta account connected.", { status: 200 });
}

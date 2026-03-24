import { SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { appMiddleware, mcpJwtMiddleware, metaOAuthMiddleware } from "../src/middleware";
import { setBindingsForTests } from "../src/lib/runtime/env";
import { getMetaConnectionByWorkspaceId } from "../src/lib/storage/connection-repo";
import { createAppSessionToken } from "../src/lib/web/session";
import { upsertMetaConnection } from "../src/lib/storage/connection-repo";
import {
  FakeD1Database,
  FakeKVNamespace,
  createTestBindings,
} from "./helpers/fakes";

async function signToken(payload: Record<string, unknown>) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode("test-secret"));
}

describe("middleware", () => {
  it("rejects unauthenticated MCP requests", async () => {
    setBindingsForTests(createTestBindings());
    const response = await mcpJwtMiddleware(
      new Request("https://example.com/mcp", {
        method: "POST",
      }),
      {
        setAuth: vi.fn(),
      } as never
    );

    expect(response?.status).toBe(401);
  });

  it("accepts authenticated MCP requests and forwards auth info", async () => {
    setBindingsForTests(createTestBindings());
    const token = await signToken({
      sub: "user_1",
      workspaceId: "workspace_1",
      roles: ["admin"],
    });
    const setAuth = vi.fn();

    const response = await mcpJwtMiddleware(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
      {
        setAuth,
      } as never
    );

    expect(response).toBeUndefined();
    expect(setAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        extra: expect.objectContaining({
          userId: "user_1",
          workspaceId: "workspace_1",
        }),
      })
    );
  });

  it("redirects OAuth start requests to Meta", async () => {
    const bindings = createTestBindings({
      META_OAUTH_STATE: new FakeKVNamespace(),
    });
    setBindingsForTests(bindings);
    const token = await signToken({
      sub: "user_1",
      workspaceId: "workspace_1",
    });

    const response = await metaOAuthMiddleware(
      new Request(
        "https://example.com/oauth/meta/start?workspace_id=workspace_1&return_to=/app",
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        }
      ),
      {
        setAuth: vi.fn(),
      } as never
    );

    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toContain(
      "https://www.facebook.com/dialog/oauth"
    );
  });

  it("allows OAuth return_to redirects on configured external origins", async () => {
    const kv = new FakeKVNamespace();
    setBindingsForTests(
      createTestBindings({
        META_OAUTH_STATE: kv,
        META_OAUTH_ALLOWED_RETURN_ORIGINS: "http://localhost:3030",
      })
    );
    const token = await signToken({
      sub: "user_1",
      workspaceId: "workspace_1",
    });

    const response = await metaOAuthMiddleware(
      new Request(
        "https://example.com/oauth/meta/start?workspace_id=workspace_1&return_to=http://localhost:3030/app",
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        }
      ),
      {
        setAuth: vi.fn(),
      } as never
    );

    expect(response?.status).toBe(302);

    const savedState = Array.from(kv.data.values()).map((value) =>
      JSON.parse(value) as { returnTo: string | null }
    );
    expect(savedState[0]?.returnTo).toBe("http://localhost:3030/app");
  });

  it("stores a Meta connection on OAuth callback success", async () => {
    const kv = new FakeKVNamespace();
    const db = new FakeD1Database();
    kv.data.set(
      "state-123",
      JSON.stringify({
        userId: "user_1",
        workspaceId: "workspace_1",
        returnTo: "https://example.com/app",
      })
    );

    setBindingsForTests(
      createTestBindings({
        META_DB: db,
        META_OAUTH_STATE: kv,
      })
    );

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: "short-token",
              expires_in: 300,
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: "long-token",
              expires_in: 3600,
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: "graph-user",
              name: "Graph User",
            }),
            { status: 200 }
          )
        )
    );

    const response = await metaOAuthMiddleware(
      new Request(
        "https://example.com/oauth/meta/callback?state=state-123&code=code-123"
      ),
      {
        setAuth: vi.fn(),
      } as never
    );

    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toContain("meta_oauth=connected");

    const connection = await getMetaConnectionByWorkspaceId("workspace_1");
    expect(connection?.accessToken).toBe("long-token");
    expect(connection?.graphUserId).toBe("graph-user");
  });

  it("renders the login page for /app without a session", async () => {
    setBindingsForTests(createTestBindings());

    const response = await appMiddleware(
      new Request("https://example.com/app"),
      {
        setAuth: vi.fn(),
      } as never
    );

    expect(response?.status).toBe(200);
    expect(await response?.text()).toContain("Open Admin App");
  });

  it("creates an app session cookie after a successful login", async () => {
    setBindingsForTests(createTestBindings());

    const response = await appMiddleware(
      new Request("https://example.com/app/login", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "password=open-sesame",
      }),
      {
        setAuth: vi.fn(),
      } as never
    );

    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toBe("https://example.com/app");
    expect(response?.headers.get("set-cookie")).toContain("meta_mcp_app_session=");
  });

  it("starts Meta OAuth from the admin app with a session cookie", async () => {
    const kv = new FakeKVNamespace();
    setBindingsForTests(
      createTestBindings({
        META_OAUTH_STATE: kv,
      })
    );

    const cookie = await createAppSessionToken({
      userId: "app_admin",
      workspaceId: "workspace_admin",
    });

    const response = await appMiddleware(
      new Request("https://example.com/app/connect", {
        headers: {
          cookie: `meta_mcp_app_session=${encodeURIComponent(cookie)}`,
        },
      }),
      {
        setAuth: vi.fn(),
      } as never
    );

    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toContain(
      "https://www.facebook.com/dialog/oauth"
    );

    const savedState = Array.from(kv.data.values()).map((value) =>
      JSON.parse(value) as { workspaceId: string; returnTo: string | null }
    );
    expect(savedState[0]?.workspaceId).toBe("workspace_admin");
    expect(savedState[0]?.returnTo).toBe("https://example.com/app");
  });

  it("returns ad accounts through the admin app api", async () => {
    setBindingsForTests(createTestBindings());
    await upsertMetaConnection({
      workspaceId: "workspace_admin",
      userId: "app_admin",
      accessToken: "meta-access-token",
      expiresAt: null,
      scopes: ["ads_management"],
      graphUserId: "graph-user",
      graphUserName: "Graph User",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "act_123",
                account_id: "123",
                name: "Primary Account",
                account_status: 1,
                currency: "USD",
                timezone_name: "America/Denver",
                balance: "0",
              },
            ],
            paging: {},
          }),
          { status: 200 }
        )
      )
    );

    const cookie = await createAppSessionToken({
      userId: "app_admin",
      workspaceId: "workspace_admin",
    });

    const response = await appMiddleware(
      new Request("https://example.com/app/api/ad-accounts", {
        headers: {
          cookie: `meta_mcp_app_session=${encodeURIComponent(cookie)}`,
        },
      }),
      {
        setAuth: vi.fn(),
      } as never
    );

    expect(response?.status).toBe(200);
    const payload = await response?.json() as {
      items: Array<{ account_id: string; name: string }>;
    };
    expect(payload.items).toEqual([
      expect.objectContaining({
        account_id: "123",
        name: "Primary Account",
      }),
    ]);
  });

  it("returns a usable mcp token from the admin app api", async () => {
    setBindingsForTests(createTestBindings());

    const cookie = await createAppSessionToken({
      userId: "app_admin",
      workspaceId: "workspace_admin",
    });

    const response = await appMiddleware(
      new Request("https://example.com/app/api/mcp-token", {
        headers: {
          cookie: `meta_mcp_app_session=${encodeURIComponent(cookie)}`,
        },
      }),
      {
        setAuth: vi.fn(),
      } as never
    );

    expect(response?.status).toBe(200);
    const payload = await response?.json() as {
      token: string;
      workspaceId: string;
      url: string;
    };

    expect(payload.workspaceId).toBe("workspace_admin");
    expect(payload.url).toBe("https://example.com/mcp");
    expect(payload.token).toEqual(expect.any(String));

    const verifyResponse = await mcpJwtMiddleware(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: {
          authorization: `Bearer ${payload.token}`,
        },
      }),
      {
        setAuth: vi.fn(),
      } as never
    );

    expect(verifyResponse).toBeUndefined();
  });
});

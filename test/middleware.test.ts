import { SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import middleware from "../src/middleware";
import { setBindingsForTests } from "../src/lib/runtime/env";
import { getMetaConnectionByWorkspaceId } from "../src/lib/storage/connection-repo";
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
    const response = await middleware[1](
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

    const response = await middleware[1](
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

    const response = await middleware[0](
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

    const response = await middleware[0](
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

    const response = await middleware[0](
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
});

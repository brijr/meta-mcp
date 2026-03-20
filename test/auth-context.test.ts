import type { ToolExtraArguments } from "xmcp";
import { describe, expect, it } from "vitest";
import { getAuthContext } from "../src/lib/auth/context";

describe("getAuthContext", () => {
  it("extracts user and workspace claims from authInfo.extra", () => {
    const context = getAuthContext({
      signal: new AbortController().signal,
      authInfo: {
        token: "token",
        clientId: "client",
        scopes: ["ads_management"],
        extra: {
          userId: "user_1",
          workspaceId: "workspace_1",
          roles: ["admin"],
        },
      },
      requestId: "req-1",
      sendNotification: async () => undefined,
      sendRequest: async () => ({}),
    } as unknown as ToolExtraArguments);

    expect(context).toEqual({
      userId: "user_1",
      workspaceId: "workspace_1",
      roles: ["admin"],
      token: "token",
      scopes: ["ads_management"],
    });
  });

  it("throws when auth context is missing", () => {
    expect(() =>
      getAuthContext({
        signal: new AbortController().signal,
        requestId: "req-1",
        sendNotification: async () => undefined,
        sendRequest: async () => ({}),
      } as unknown as ToolExtraArguments)
    ).toThrow(/Missing authenticated user\/workspace context/);
  });
});

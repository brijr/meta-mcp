import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MetaApiError } from "../src/lib/errors";
import { MetaGraphClient } from "../src/lib/meta/client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("MetaGraphClient", () => {
  it("retries retryable GET failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: "temporary",
            },
          }),
          { status: 500 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "me" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const client = new MetaGraphClient("token", undefined, "v22.0");
    const result = await client.get<{ id: string }>("me", { fields: "id" });

    expect(result).toEqual({ id: "me" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a typed MetaApiError for Meta API failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: "expired token",
              code: 190,
            },
          }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          }
        )
      )
    );

    const client = new MetaGraphClient("token", undefined, "v22.0");

    await expect(client.get("me")).rejects.toMatchObject({
      code: "meta_api_error",
      metaCode: 190,
    } satisfies Partial<MetaApiError>);
  });

  it("does not crash on a non-JSON error response (#15)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("error=invalid_token&error_description=bad", {
          status: 400,
          headers: { "content-type": "text/plain" },
        })
      )
    );

    const client = new MetaGraphClient("token", undefined, "v22.0");

    await expect(client.get("me")).rejects.toMatchObject({
      code: "meta_api_error",
      httpStatus: 400,
      details: { body: "error=invalid_token&error_description=bad" },
    } satisfies Partial<MetaApiError>);
  });

  it("surfaces an HTML body without throwing a SyntaxError (#15)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>Bad Gateway</html>", {
          status: 400,
          headers: { "content-type": "text/html" },
        })
      )
    );

    const client = new MetaGraphClient("token", undefined, "v22.0");
    const error = await client.get("me").catch((err: unknown) => err);

    expect(error).toBeInstanceOf(MetaApiError);
    expect((error as Error).message).not.toContain("invalid character");
  });

  it("appends appsecret_proof when an app secret is configured (#3)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "me" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new MetaGraphClient("the-token", "app-secret", "v22.0");
    await client.get("me");

    const requestedUrl = fetchMock.mock.calls[0]?.[0] as URL;
    const expected = createHmac("sha256", "app-secret")
      .update("the-token")
      .digest("hex");
    expect(requestedUrl.searchParams.get("appsecret_proof")).toBe(expected);
  });

  it("omits appsecret_proof when no app secret is configured (#3)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "me" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new MetaGraphClient("the-token", undefined, "v22.0");
    await client.get("me");

    const requestedUrl = fetchMock.mock.calls[0]?.[0] as URL;
    expect(requestedUrl.searchParams.get("appsecret_proof")).toBeNull();
  });
});

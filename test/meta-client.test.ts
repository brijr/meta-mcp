import { describe, expect, it, vi } from "vitest";
import { MetaApiError } from "../src/lib/errors";
import { MetaGraphClient } from "../src/lib/meta/client";

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

    const client = new MetaGraphClient("token", "v22.0");
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

    const client = new MetaGraphClient("token", "v22.0");

    await expect(client.get("me")).rejects.toMatchObject({
      code: "meta_api_error",
      metaCode: 190,
    } satisfies Partial<MetaApiError>);
  });
});

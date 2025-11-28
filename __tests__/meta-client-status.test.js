import { jest } from "@jest/globals";
import { MetaApiClient } from "../src/meta-client.ts";
import { PaginationHelper } from "../src/utils/pagination.ts";

const authMock = {
  getAccountId: (id) => (id.startsWith("act_") ? id : `act_${id}`),
};

describe("MetaApiClient effective_status serialization and cursor pass-through", () => {
  let client;
  let makeRequestSpy;
  let parseSpy;

  beforeEach(() => {
    client = new MetaApiClient(authMock);
    makeRequestSpy = jest
      .spyOn(client, "makeRequest")
      .mockResolvedValue({ data: [], paging: {} });
    parseSpy = jest
      .spyOn(PaginationHelper, "parsePaginatedResponse")
      .mockReturnValue({ data: [], hasNextPage: false, hasPreviousPage: false });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sends campaign effective_status as a flat array and forwards after cursor", async () => {
    await client.getCampaigns("act_123", {
      status: ["ACTIVE", "PAUSED"],
      after: "CUR",
    });

    const [endpoint] = makeRequestSpy.mock.calls[0];
    const params = new URL(endpoint, "https://example.com").searchParams;
    const effectiveStatus = JSON.parse(params.get("effective_status") || "[]");

    expect(effectiveStatus).toEqual(["ACTIVE", "PAUSED"]);
    expect(parseSpy).toHaveBeenCalledWith(expect.anything(), "CUR");
  });

  it("wraps single ad set status in an array and forwards after cursor", async () => {
    await client.getAdSets({
      accountId: "act_123",
      status: "ACTIVE",
      after: "CUR",
    });

    const [endpoint] = makeRequestSpy.mock.calls[0];
    const params = new URL(endpoint, "https://example.com").searchParams;
    const effectiveStatus = JSON.parse(params.get("effective_status") || "[]");

    expect(effectiveStatus).toEqual(["ACTIVE"]);
    expect(parseSpy).toHaveBeenCalledWith(expect.anything(), "CUR");
  });

  it("supports array status for getAds and forwards after cursor", async () => {
    await client.getAds({
      accountId: "act_123",
      status: ["ACTIVE", "PAUSED"],
      after: "CUR",
    });

    const [endpoint] = makeRequestSpy.mock.calls[0];
    const params = new URL(endpoint, "https://example.com").searchParams;
    const effectiveStatus = JSON.parse(params.get("effective_status") || "[]");

    expect(effectiveStatus).toEqual(["ACTIVE", "PAUSED"]);
    expect(parseSpy).toHaveBeenCalledWith(expect.anything(), "CUR");
  });
});

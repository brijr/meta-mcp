import { PaginationHelper } from "../src/utils/pagination.ts";

describe("PaginationHelper getNextPageParams", () => {
  it("uses paging.next when no after cursor is provided", () => {
    const result = {
      data: [],
      paging: {
        next: "https://graph.facebook.com/v23.0/act_1/insights?after=XYZ",
      },
      hasNextPage: true,
      hasPreviousPage: false,
    };

    const params = PaginationHelper.getNextPageParams(result, 50);

    expect(params).toEqual({ after: "XYZ", limit: 50 });
  });

  it("continues fetchAllPages when only paging.next is present", async () => {
    const calls = [];
    const pages = [
      {
        data: [1],
        paging: {
          next: "https://graph.facebook.com/v23.0/act_1/insights?after=XYZ",
        },
        hasNextPage: true,
        hasPreviousPage: false,
      },
      {
        data: [2],
        paging: {},
        hasNextPage: false,
        hasPreviousPage: true,
      },
    ];

    const collected = [];
    for await (const page of PaginationHelper.fetchAllPages(async (params) => {
      calls.push(params);
      return pages[calls.length - 1];
    })) {
      collected.push(...page);
    }

    expect(collected).toEqual([1, 2]);
    expect(calls[1].after).toBe("XYZ");
  });
});

describe("PaginationHelper loop guard", () => {
  it("clears hasNextPage when Meta repeats the requested cursor", () => {
    const response = {
      data: [],
      paging: {
        cursors: { after: "CUR" },
        next: "https://graph.facebook.com/v23.0/act_1/insights?after=CUR",
      },
    };

    const parsed = PaginationHelper.parsePaginatedResponse(response, "CUR");

    expect(parsed.hasNextPage).toBe(false);
    expect(parsed.paging?.next).toBeUndefined();
  });

  it("keeps paging when next cursor advances", () => {
    const response = {
      data: [],
      paging: {
        cursors: { after: "CUR" },
        next: "https://graph.facebook.com/v23.0/act_1/insights?after=CUR-2",
      },
    };

    const parsed = PaginationHelper.parsePaginatedResponse(response, "CUR");

    expect(parsed.hasNextPage).toBe(true);
    expect(parsed.paging?.next).toContain("CUR-2");
  });
});

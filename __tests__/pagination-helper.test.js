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

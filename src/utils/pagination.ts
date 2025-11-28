import type { MetaApiResponse } from "../types/meta-api.js";

export interface PaginationParams {
  limit?: number;
  after?: string;
  before?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  totalCount?: number;
}

export class PaginationHelper {
  static buildPaginationParams(params: PaginationParams): URLSearchParams {
    const urlParams = new URLSearchParams();

    if (params.limit !== undefined && params.limit > 0) {
      urlParams.set("limit", params.limit.toString());
    }

    if (params.after) {
      urlParams.set("after", params.after);
    }

    if (params.before) {
      urlParams.set("before", params.before);
    }

    return urlParams;
  }

  static parsePaginatedResponse<T>(
    response: MetaApiResponse<T>
  ): PaginatedResult<T> {
    const hasNextPage = Boolean(
      response.paging?.next || response.paging?.cursors?.after
    );
    const hasPreviousPage = Boolean(
      response.paging?.previous || response.paging?.cursors?.before
    );

    return {
      data: response.data || [],
      paging: response.paging,
      hasNextPage,
      hasPreviousPage,
    };
  }

  static getNextPageParams(
    result: PaginatedResult<any>,
    currentLimit?: number
  ): PaginationParams | null {
    if (!result.hasNextPage) {
      return null;
    }

    const cursor =
      result.paging?.cursors?.after ||
      this.extractCursorFromUrl(result.paging?.next);

    if (!cursor) {
      return null;
    }

    return {
      after: cursor,
      limit: currentLimit,
    };
  }

  static getPreviousPageParams(
    result: PaginatedResult<any>,
    currentLimit?: number
  ): PaginationParams | null {
    if (!result.hasPreviousPage || !result.paging?.cursors?.before) {
      return null;
    }

    return {
      before: result.paging.cursors.before,
      limit: currentLimit,
    };
  }

  static async *fetchAllPages<T>(
    fetchPage: (params: PaginationParams) => Promise<PaginatedResult<T>>,
    initialParams: PaginationParams = {},
    maxPages: number = 100
  ): AsyncGenerator<T[], void, unknown> {
    let currentParams = { ...initialParams };
    let pageCount = 0;

    while (pageCount < maxPages) {
      const result = await fetchPage(currentParams);
      yield result.data;

      pageCount++;

      if (!result.hasNextPage) {
        break;
      }

      const nextParams = this.getNextPageParams(result, currentParams.limit);
      if (!nextParams) {
        break;
      }

      currentParams = { ...currentParams, ...nextParams };
    }
  }

  static async collectAllPages<T>(
    fetchPage: (params: PaginationParams) => Promise<PaginatedResult<T>>,
    initialParams: PaginationParams = {},
    maxPages: number = 50,
    maxItems: number = 5000
  ): Promise<T[]> {
    const allItems: T[] = [];

    for await (const pageData of this.fetchAllPages(
      fetchPage,
      initialParams,
      maxPages
    )) {
      allItems.push(...pageData);

      if (allItems.length >= maxItems) {
        allItems.splice(maxItems); // Trim to max items
        break;
      }
    }

    return allItems;
  }

  static createBatchedRequests<T>(items: T[], batchSize: number = 50): T[][] {
    const batches: T[][] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    return batches;
  }

  static async processBatchedRequests<TInput, TOutput>(
    items: TInput[],
    processor: (batch: TInput[]) => Promise<TOutput[]>,
    batchSize: number = 50,
    delayMs: number = 1000
  ): Promise<TOutput[]> {
    const batches = this.createBatchedRequests(items, batchSize);
    const results: TOutput[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      try {
        const batchResults = await processor(batch);
        results.push(...batchResults);
      } catch (error) {
        console.error(`Batch ${i + 1}/${batches.length} failed:`, error);
        throw error;
      }

      // Add delay between batches to respect rate limits
      if (i < batches.length - 1 && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  static extractCursorFromUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;

    try {
      const urlObj = new URL(url);
      return (
        urlObj.searchParams.get("after") ||
        urlObj.searchParams.get("before") ||
        undefined
      );
    } catch {
      return undefined;
    }
  }

  static buildPageInfo(result: PaginatedResult<any>) {
    return {
      hasNextPage: result.hasNextPage,
      hasPreviousPage: result.hasPreviousPage,
      startCursor: result.paging?.cursors?.before,
      endCursor: result.paging?.cursors?.after,
      totalCount: result.totalCount,
    };
  }
}

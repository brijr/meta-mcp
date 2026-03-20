import { normalizeAdAccountId } from "../lib/meta/ids";
import type { MetaToolContext } from "../lib/tools/handler";
import { toMetaItemResult, toMetaListResult, withMetaOverrides } from "./shared";

function mapAudienceSubtype(sourceType: string): string {
  switch (sourceType) {
    case "engagement":
      return "ENGAGEMENT";
    case "customer_list":
      return "CUSTOM";
    case "website":
    default:
      return "CUSTOM";
  }
}

function mapTargetingSearchType(value?: string): string {
  switch ((value ?? "").toLowerCase()) {
    case "behavior":
      return "adTargetingCategory";
    case "demographic":
      return "adTargetingCategory";
    case "interest":
    default:
      return "adinterest";
  }
}

export async function getTargetingOptionsService(
  args: {
    query: string;
    type?: string;
    limit?: number;
  },
  context: MetaToolContext
) {
  const response = await context.meta.list<Record<string, unknown>>("search", {
    q: args.query,
    type: mapTargetingSearchType(args.type),
    limit: args.limit ?? 25,
  });

  return {
    text: `Found ${response.items.length} targeting option(s).`,
    data: toMetaListResult(response.items, response.page),
  };
}

export async function createCustomAudienceService(
  args: {
    account_id: string;
    name: string;
    source_type: string;
    config: Record<string, unknown>;
    meta_overrides?: Record<string, unknown>;
  },
  context: MetaToolContext
) {
  const payload = withMetaOverrides(
    {
      name: args.name,
      subtype: mapAudienceSubtype(args.source_type),
      customer_file_source:
        args.source_type === "customer_list" ? "USER_PROVIDED_ONLY" : undefined,
      ...args.config,
    },
    args.meta_overrides
  );

  const created = await context.meta.post<{ id: string }>(
    `${normalizeAdAccountId(args.account_id)}/customaudiences`,
    payload
  );

  return {
    text: `Created custom audience ${created.id}.`,
    data: toMetaItemResult({
      id: created.id,
      name: args.name,
      source_type: args.source_type,
    }),
  };
}

export async function createLookalikeAudienceService(
  args: {
    account_id: string;
    source_audience_id: string;
    country: string;
    ratio: number;
    name?: string;
    meta_overrides?: Record<string, unknown>;
  },
  context: MetaToolContext
) {
  const payload = withMetaOverrides(
    {
      name:
        args.name ??
        `Lookalike ${args.source_audience_id} ${args.country} ${args.ratio}`,
      subtype: "LOOKALIKE",
      origin_audience_id: args.source_audience_id,
      lookalike_spec: {
        type: "similarity",
        country: args.country,
        ratio: args.ratio,
      },
    },
    args.meta_overrides
  );

  const created = await context.meta.post<{ id: string }>(
    `${normalizeAdAccountId(args.account_id)}/customaudiences`,
    payload
  );

  return {
    text: `Created lookalike audience ${created.id}.`,
    data: toMetaItemResult({
      id: created.id,
      name: payload.name,
    }),
  };
}

export async function listAudiencesService(
  args: {
    account_id: string;
    type?: string;
    limit?: number;
    after?: string;
  },
  context: MetaToolContext
) {
  const accountId = normalizeAdAccountId(args.account_id);
  const includeCustom = !args.type || args.type === "custom";
  const includeSaved = !args.type || args.type === "saved";

  const [custom, saved] = await Promise.all([
    includeCustom
      ? context.meta.list<Record<string, unknown>>(`${accountId}/customaudiences`, {
          fields: "id,name,subtype,approximate_count,time_updated",
          limit: args.limit,
          after: args.after,
        })
      : Promise.resolve({ items: [], page: {} }),
    includeSaved
      ? context.meta.list<Record<string, unknown>>(`${accountId}/saved_audiences`, {
          fields: "id,name,approximate_count,time_updated",
          limit: args.limit,
          after: args.after,
        })
      : Promise.resolve({ items: [], page: {} }),
  ]);

  const items = [
    ...custom.items.map((item) => ({ ...item, audience_type: "custom" })),
    ...saved.items.map((item) => ({ ...item, audience_type: "saved" })),
  ];

  return {
    text: `Found ${items.length} audience(s).`,
    data: toMetaListResult(items, custom.items.length > 0 ? custom.page : saved.page),
  };
}

export async function getAudienceSizeService(
  args: {
    account_id: string;
    targeting: Record<string, unknown>;
  },
  context: MetaToolContext
) {
  const item = await context.meta.get<Record<string, unknown>>(
    `${normalizeAdAccountId(args.account_id)}/reachestimate`,
    {
      targeting_spec: args.targeting,
    }
  );

  return {
    text: `Estimated audience size for ${args.account_id}.`,
    data: toMetaItemResult(item),
  };
}

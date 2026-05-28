import { normalizeAdAccountId } from "../lib/meta/ids";
import type { MetaToolContext } from "../lib/tools/handler";
import { filterByDateRange, toMetaItemResult, toMetaListResult, withMetaOverrides, applyBudgetFields } from "./shared";

const CAMPAIGN_FIELDS = [
  "id",
  "name",
  "status",
  "objective",
  "account_id",
  "buying_type",
  "special_ad_categories",
  "bid_strategy",
  "daily_budget",
  "lifetime_budget",
  "created_time",
  "updated_time",
  "effective_status",
];

export async function getCampaignEntity(
  context: MetaToolContext,
  campaignId: string
) {
  return context.meta.get<Record<string, unknown>>(campaignId, {
    fields: CAMPAIGN_FIELDS.join(","),
  });
}

export async function listCampaignEntities(
  context: MetaToolContext,
  args: {
    account_id: string;
    status?: string;
    objective?: string;
    date_range?: {
      since: string;
      until: string;
    };
    limit?: number;
    after?: string;
  }
) {
  const response = await context.meta.list<Record<string, unknown>>(
    `${normalizeAdAccountId(args.account_id)}/campaigns`,
    {
      fields: CAMPAIGN_FIELDS.join(","),
      limit: args.limit,
      after: args.after,
    }
  );

  const filtered = filterByDateRange(response.items, args.date_range, "updated_time")
    .filter((item) =>
      args.status
        ? String(item.status ?? item.effective_status ?? "").toLowerCase() ===
          args.status.toLowerCase()
        : true
    )
    .filter((item) =>
      args.objective
        ? String(item.objective ?? "").toLowerCase() ===
          args.objective.toLowerCase()
        : true
    );

  return {
    items: filtered,
    page: response.page,
  };
}

export async function createCampaignService(
  args: {
    account_id: string;
    name: string;
    objective: string;
    buying_type?: string;
    special_ad_categories?: string[];
    status?: string;
    budget?: {
      amount_minor: number;
      currency: string;
      period: "daily" | "lifetime";
    };
    meta_overrides?: Record<string, unknown>;
  },
  context: MetaToolContext
) {
  let payload = {
    name: args.name,
    objective: args.objective,
    buying_type: args.buying_type,
    special_ad_categories: args.special_ad_categories,
    status: args.status ?? "PAUSED",
  } as Record<string, unknown>;
  payload = applyBudgetFields(payload, args.budget);
  payload = withMetaOverrides(payload, args.meta_overrides);

  const created = await context.meta.post<{ id: string }>(
    `${normalizeAdAccountId(args.account_id)}/campaigns`,
    payload
  );
  const item = await getCampaignEntity(context, created.id);

  return {
    text: `Created campaign ${created.id}.`,
    data: toMetaItemResult(item),
  };
}

export async function updateCampaignService(
  args: {
    campaign_id: string;
    name?: string;
    status?: string;
    budget?: {
      amount_minor: number;
      currency: string;
      period: "daily" | "lifetime";
    };
    bid_strategy?: string;
    meta_overrides?: Record<string, unknown>;
  },
  context: MetaToolContext
) {
  let payload = {
    name: args.name,
    status: args.status,
    bid_strategy: args.bid_strategy,
  } as Record<string, unknown>;
  payload = applyBudgetFields(payload, args.budget);
  payload = withMetaOverrides(payload, args.meta_overrides);

  await context.meta.post(args.campaign_id, payload);
  const item = await getCampaignEntity(context, args.campaign_id);

  return {
    text: `Updated campaign ${args.campaign_id}.`,
    data: toMetaItemResult(item),
  };
}

export async function getCampaignService(
  args: {
    campaign_id: string;
  },
  context: MetaToolContext
) {
  const item = await getCampaignEntity(context, args.campaign_id);
  return {
    text: `Loaded campaign ${args.campaign_id}.`,
    data: toMetaItemResult(item),
  };
}

export async function listCampaignsService(
  args: {
    account_id: string;
    status?: string;
    objective?: string;
    date_range?: {
      since: string;
      until: string;
    };
    limit?: number;
    after?: string;
  },
  context: MetaToolContext
) {
  const response = await listCampaignEntities(context, args);
  return {
    text: `Found ${response.items.length} campaign(s).`,
    data: toMetaListResult(response.items, response.page),
  };
}

export async function deleteCampaignService(
  args: {
    campaign_id: string;
  },
  context: MetaToolContext
) {
  await context.meta.delete(args.campaign_id);
  return {
    text: `Deleted campaign ${args.campaign_id}.`,
    data: {
      success: true,
      id: args.campaign_id,
    },
  };
}

import type { MetaToolContext } from "../lib/tools/handler";
import {
  applyBudgetFields,
  applyScheduleFields,
  toMetaItemResult,
  toMetaListResult,
  withMetaOverrides,
} from "./shared";

const AD_SET_FIELDS = [
  "id",
  "account_id",
  "campaign_id",
  "name",
  "status",
  "effective_status",
  "targeting",
  "optimization_goal",
  "billing_event",
  "daily_budget",
  "lifetime_budget",
  "bid_amount",
  "start_time",
  "end_time",
  "created_time",
  "updated_time",
  "promoted_object",
  "attribution_spec",
];

export async function getAdSetEntity(
  context: MetaToolContext,
  adSetId: string
) {
  return context.meta.get<Record<string, unknown>>(adSetId, {
    fields: AD_SET_FIELDS.join(","),
  });
}

export async function listAdSetEntities(
  context: MetaToolContext,
  args: {
    campaign_id: string;
    status?: string;
    limit?: number;
    after?: string;
  }
) {
  const response = await context.meta.list<Record<string, unknown>>(
    `${args.campaign_id}/adsets`,
    {
      fields: AD_SET_FIELDS.join(","),
      limit: args.limit,
      after: args.after,
    }
  );

  return {
    items: response.items.filter((item) =>
      args.status
        ? String(item.status ?? item.effective_status ?? "").toLowerCase() ===
          args.status.toLowerCase()
        : true
    ),
    page: response.page,
  };
}

export async function createAdSetService(
  args: {
    campaign_id: string;
    name: string;
    targeting: Record<string, unknown>;
    optimization_goal: string;
    billing_event: string;
    budget: {
      amount_minor: number;
      currency: string;
      period: "daily" | "lifetime";
    };
    schedule?: {
      start_time: string;
      end_time?: string;
    };
    status?: string;
    bid_amount?: number;
    meta_overrides?: Record<string, unknown>;
  },
  context: MetaToolContext
) {
  let payload: Record<string, unknown> = {
    name: args.name,
    targeting: args.targeting,
    optimization_goal: args.optimization_goal,
    billing_event: args.billing_event,
    status: args.status ?? "PAUSED",
    bid_amount: args.bid_amount,
  };
  payload = applyBudgetFields(payload, args.budget);
  payload = applyScheduleFields(payload, args.schedule);
  payload = withMetaOverrides(payload, args.meta_overrides);

  const created = await context.meta.post<{ id: string }>(
    `${args.campaign_id}/adsets`,
    payload
  );
  const item = await getAdSetEntity(context, created.id);

  return {
    text: `Created ad set ${created.id}.`,
    data: toMetaItemResult(item),
  };
}

export async function updateAdSetService(
  args: {
    ad_set_id: string;
    targeting?: Record<string, unknown>;
    budget?: {
      amount_minor: number;
      currency: string;
      period: "daily" | "lifetime";
    };
    schedule?: {
      start_time: string;
      end_time?: string;
    };
    status?: string;
    bid_amount?: number;
    optimization_goal?: string;
    billing_event?: string;
    meta_overrides?: Record<string, unknown>;
  },
  context: MetaToolContext
) {
  let payload: Record<string, unknown> = {
    targeting: args.targeting,
    status: args.status,
    bid_amount: args.bid_amount,
    optimization_goal: args.optimization_goal,
    billing_event: args.billing_event,
  };
  payload = applyBudgetFields(payload, args.budget);
  payload = applyScheduleFields(payload, args.schedule);
  payload = withMetaOverrides(payload, args.meta_overrides);

  await context.meta.post(args.ad_set_id, payload);
  const item = await getAdSetEntity(context, args.ad_set_id);

  return {
    text: `Updated ad set ${args.ad_set_id}.`,
    data: toMetaItemResult(item),
  };
}

export async function getAdSetService(
  args: {
    ad_set_id: string;
  },
  context: MetaToolContext
) {
  const item = await getAdSetEntity(context, args.ad_set_id);
  return {
    text: `Loaded ad set ${args.ad_set_id}.`,
    data: toMetaItemResult(item),
  };
}

export async function listAdSetsService(
  args: {
    campaign_id: string;
    status?: string;
    limit?: number;
    after?: string;
  },
  context: MetaToolContext
) {
  const response = await listAdSetEntities(context, args);
  return {
    text: `Found ${response.items.length} ad set(s).`,
    data: toMetaListResult(response.items, response.page),
  };
}

export async function deleteAdSetService(
  args: {
    ad_set_id: string;
  },
  context: MetaToolContext
) {
  await context.meta.delete(args.ad_set_id);
  return {
    text: `Deleted ad set ${args.ad_set_id}.`,
    data: {
      success: true,
      id: args.ad_set_id,
    },
  };
}

export async function duplicateAdSetService(
  args: {
    ad_set_id: string;
    overrides?: Record<string, unknown>;
  },
  context: MetaToolContext
) {
  const source = await getAdSetEntity(context, args.ad_set_id);
  const payload = withMetaOverrides(
    {
      name:
        typeof source.name === "string" ? `${source.name} Copy` : "Copied ad set",
      targeting: source.targeting,
      optimization_goal: source.optimization_goal,
      billing_event: source.billing_event,
      daily_budget: source.daily_budget,
      lifetime_budget: source.lifetime_budget,
      bid_amount: source.bid_amount,
      start_time: source.start_time,
      end_time: source.end_time,
      status: "PAUSED",
      promoted_object: source.promoted_object,
      attribution_spec: source.attribution_spec,
    },
    args.overrides
  );

  const created = await context.meta.post<{ id: string }>(
    `${source.campaign_id as string}/adsets`,
    payload
  );
  const item = await getAdSetEntity(context, created.id);

  return {
    text: `Duplicated ad set ${args.ad_set_id} into ${created.id}.`,
    data: toMetaItemResult(item),
  };
}

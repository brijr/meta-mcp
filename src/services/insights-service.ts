import type { MetaToolContext } from "../lib/tools/handler";
import { toMetaItemResult, toMetaListResult } from "./shared";

const DEFAULT_METRICS = [
  "impressions",
  "clicks",
  "spend",
  "cpm",
  "cpc",
  "ctr",
  "reach",
  "actions",
  "cost_per_action_type",
];

const DEFAULT_CONVERSION_METRICS = [
  "impressions",
  "spend",
  "actions",
  "cost_per_action_type",
  "action_values",
];

function buildInsightsParams(args: {
  metrics?: string[];
  date_range?: {
    since: string;
    until: string;
  };
  level?: string;
  breakdowns?: string[];
}) {
  return {
    fields: (args.metrics && args.metrics.length > 0
      ? args.metrics
      : DEFAULT_METRICS
    ).join(","),
    level: args.level,
    time_range: args.date_range,
    breakdowns: args.breakdowns?.join(","),
  };
}

async function fetchInsightRows(
  context: MetaToolContext,
  objectId: string,
  args: {
    metrics?: string[];
    date_range?: {
      since: string;
      until: string;
    };
    level?: string;
    breakdowns?: string[];
  }
) {
  return context.meta.list<Record<string, unknown>>(`${objectId}/insights`, buildInsightsParams(args));
}

export async function getInsightsService(
  args: {
    object_id: string;
    level: string;
    metrics: string[];
    date_range?: {
      since: string;
      until: string;
    };
    breakdowns?: string[];
  },
  context: MetaToolContext
) {
  const response = await fetchInsightRows(context, args.object_id, args);
  return {
    text: `Loaded ${response.items.length} insight row(s) for ${args.object_id}.`,
    data: toMetaListResult(response.items, response.page),
  };
}

export async function getAdMetricsService(
  args: {
    ad_id: string;
    date_range?: {
      since: string;
      until: string;
    };
  },
  context: MetaToolContext
) {
  const response = await fetchInsightRows(context, args.ad_id, {
    level: "ad",
    date_range: args.date_range,
    metrics: DEFAULT_METRICS,
  });
  return {
    text: `Loaded ad metrics for ${args.ad_id}.`,
    data: toMetaItemResult(response.items[0] ?? {}),
  };
}

export async function getAdSetMetricsService(
  args: {
    ad_set_id: string;
    date_range?: {
      since: string;
      until: string;
    };
  },
  context: MetaToolContext
) {
  const response = await fetchInsightRows(context, args.ad_set_id, {
    level: "adset",
    date_range: args.date_range,
    metrics: DEFAULT_METRICS,
  });
  return {
    text: `Loaded ad set metrics for ${args.ad_set_id}.`,
    data: toMetaItemResult(response.items[0] ?? {}),
  };
}

export async function getCampaignMetricsService(
  args: {
    campaign_id: string;
    date_range?: {
      since: string;
      until: string;
    };
  },
  context: MetaToolContext
) {
  const response = await fetchInsightRows(context, args.campaign_id, {
    level: "campaign",
    date_range: args.date_range,
    metrics: DEFAULT_METRICS,
  });
  return {
    text: `Loaded campaign metrics for ${args.campaign_id}.`,
    data: toMetaItemResult(response.items[0] ?? {}),
  };
}

export async function compareAdsService(
  args: {
    ad_ids: string[];
    metrics?: string[];
    date_range?: {
      since: string;
      until: string;
    };
  },
  context: MetaToolContext
) {
  const items = await Promise.all(
    args.ad_ids.map(async (adId) => {
      const response = await fetchInsightRows(context, adId, {
        level: "ad",
        date_range: args.date_range,
        metrics: args.metrics && args.metrics.length > 0 ? args.metrics : DEFAULT_METRICS,
      });

      return {
        ad_id: adId,
        metrics: response.items[0] ?? {},
      };
    })
  );

  return {
    text: `Compared ${items.length} ad(s).`,
    data: toMetaListResult(items),
  };
}

export async function getConversionDataService(
  args: {
    object_id: string;
    level: string;
    date_range?: {
      since: string;
      until: string;
    };
  },
  context: MetaToolContext
) {
  const response = await fetchInsightRows(context, args.object_id, {
    level: args.level,
    date_range: args.date_range,
    metrics: DEFAULT_CONVERSION_METRICS,
  });
  return {
    text: `Loaded conversion data for ${args.object_id}.`,
    data: toMetaListResult(response.items, response.page),
  };
}

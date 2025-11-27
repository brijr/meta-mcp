import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaApiClient } from "../meta-client.js";
import {
  GetInsightsSchema,
  ComparePerformanceSchema,
  ExportInsightsSchema,
} from "../types/mcp-tools";
import type { AdInsights } from "../types/meta-api";

export function setupAnalyticsTools(
  server: McpServer,
  metaClient: MetaApiClient
) {
  registerAnalyticsTools(server, metaClient);
}

export function registerAnalyticsTools(
  server: McpServer,
  metaClient: MetaApiClient
) {
  // Get Insights Tool
  server.tool(
    "get_insights",
    GetInsightsSchema.shape,
    async ({
      object_id,
      level,
      date_preset,
      time_range,
      time_increment,
      fields,
      breakdowns,
      limit,
      after,
    }) => {
      try {
        const params: Record<string, any> = {
          level,
          limit: limit || 25,
        };

        // Prefer explicit time_range over preset when both are provided
        if (time_range) {
          params.time_range = time_range;
        } else if (date_preset) {
          params.date_preset = date_preset;
        } else {
          params.date_preset = "last_7d"; // Default to last 7 days
        }

        if (fields && fields.length > 0) {
          params.fields = fields;
        }

        if (typeof time_increment === "number") {
          params.time_increment = time_increment;
        }

        if (breakdowns && breakdowns.length > 0) {
          params.breakdowns = breakdowns;
        }

        if (after) {
          params.after = after;
        }

        const result = await metaClient.getInsights(object_id, params);

        const insights = result.data.map((insight) => ({
          date_start: insight.date_start,
          date_stop: insight.date_stop,
          impressions: insight.impressions,
          clicks: insight.clicks,
          spend: insight.spend,
          reach: insight.reach,
          frequency: insight.frequency,
          ctr: insight.ctr,
          cpc: insight.cpc,
          cpm: insight.cpm,
          cpp: insight.cpp,
          actions: insight.actions,
          cost_per_action_type: insight.cost_per_action_type,
          video_views: insight.video_views,
          video_view_time: insight.video_view_time,
          account_id: insight.account_id,
          campaign_id: insight.campaign_id,
          adset_id: insight.adset_id,
          ad_id: insight.ad_id,
        }));

        // Calculate summary statistics
        const summary = calculateSummaryMetrics(insights);

        const response = {
          insights,
          summary,
          pagination: {
            has_next_page: result.hasNextPage,
            has_previous_page: result.hasPreviousPage,
            next_cursor: result.paging?.cursors?.after,
            previous_cursor: result.paging?.cursors?.before,
          },
          query_parameters: {
            object_id,
            level,
            date_preset,
            time_range,
            fields,
            breakdowns,
            after,
          },
          total_count: insights.length,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [
            {
              type: "text",
              text: `Error getting insights: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Compare Performance Tool
  server.tool(
    "compare_performance",
    ComparePerformanceSchema.shape,
    async ({ object_ids, level, date_preset, time_range, metrics }) => {
      try {
        const params: Record<string, any> = {
          level,
          fields: metrics,
        };

        if (time_range) {
          params.time_range = time_range;
        } else if (date_preset) {
          params.date_preset = date_preset;
        } else {
          params.date_preset = "last_7d";
        }

        // Fetch insights for all objects
        const comparisons: any[] = [];

        for (const objectId of object_ids) {
          try {
            const result = await metaClient.getInsights(objectId, params);
            const summary = calculateSummaryMetrics(result.data);

            // Get object details (name, etc.)
            let objectName = objectId;
            const objectType = level;

            try {
              if (level === "campaign") {
                const campaign = await metaClient.getCampaign(objectId);
                objectName = campaign.name;
              }
              // Could add similar logic for ad sets and ads
            } catch {
              // If we can't get the name, use the ID
            }

            comparisons.push({
              object_id: objectId,
              object_name: objectName,
              object_type: objectType,
              metrics: summary,
            });
          } catch (error) {
            comparisons.push({
              object_id: objectId,
              object_name: objectId,
              object_type: level,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        // Calculate performance rankings
        const rankings = calculatePerformanceRankings(comparisons, metrics);

        const response = {
          comparison_results: comparisons,
          rankings,
          query_parameters: {
            object_ids,
            level,
            date_preset,
            time_range,
            metrics,
          },
          comparison_date: new Date().toISOString(),
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [
            {
              type: "text",
              text: `Error comparing performance: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Export Insights Tool
  server.tool(
    "export_insights",
    ExportInsightsSchema.shape,
    async ({
      object_id,
      level,
      format,
      date_preset,
      time_range,
      fields,
      breakdowns,
    }) => {
      try {
        const params: Record<string, any> = {
          level,
          limit: 1000, // Get more data for export
        };

        if (time_range) {
          params.time_range = time_range;
        } else if (date_preset) {
          params.date_preset = date_preset;
        } else {
          params.date_preset = "last_30d"; // Default to last 30 days for export
        }

        if (fields && fields.length > 0) {
          params.fields = fields;
        }

        if (breakdowns && breakdowns.length > 0) {
          params.breakdowns = breakdowns;
        }

        const result = await metaClient.getInsights(object_id, params);

        let exportData: string;
        let mimeType: string;

        if (format === "csv") {
          exportData = convertToCSV(result.data);
          mimeType = "text/csv";
        } else {
          exportData = JSON.stringify(result.data, null, 2);
          mimeType = "application/json";
        }

        const response = {
          success: true,
          format,
          mime_type: mimeType,
          data_size: exportData.length,
          record_count: result.data.length,
          export_date: new Date().toISOString(),
          query_parameters: {
            object_id,
            level,
            date_preset,
            time_range,
            fields,
            breakdowns,
          },
          data: exportData,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [
            {
              type: "text",
              text: `Error exporting insights: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Get Campaign Performance Tool (simplified version of get_insights)
  server.tool(
    "get_campaign_performance",
    GetInsightsSchema.shape,
    async (params) => {
      try {
        // Set level to campaign and add campaign-specific fields
        const campaignParams = {
          ...params,
          level: "campaign" as const,
          fields: params.fields || [
            "impressions",
            "clicks",
            "spend",
            "ctr",
            "cpc",
            "cpm",
            "reach",
            "frequency",
          ],
        };

        const result = await metaClient.getInsights(
          params.object_id,
          campaignParams
        );
        const summary = calculateSummaryMetrics(result.data);

        // Get campaign details
        let campaignDetails;
        try {
          campaignDetails = await metaClient.getCampaign(params.object_id);
        } catch {
          campaignDetails = { id: params.object_id, name: "Unknown Campaign" };
        }

        const response = {
          campaign: {
            id: campaignDetails.id,
            name: campaignDetails.name,
            objective: campaignDetails.objective,
            status: campaignDetails.status,
          },
          performance: summary,
          daily_breakdown: result.data,
          query_parameters: campaignParams,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [
            {
              type: "text",
              text: `Error getting campaign performance: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Get Attribution Data Tool
  server.tool(
    "get_attribution_data",
    GetInsightsSchema.shape,
    async (params) => {
      try {
        // Add attribution-specific breakdowns and fields
        const attributionParams = {
          ...params,
          fields: params.fields || [
            "impressions",
            "clicks",
            "spend",
            "actions",
            "cost_per_action_type",
          ],
          breakdowns: params.breakdowns || ["action_attribution_windows"],
        };

        const result = await metaClient.getInsights(
          params.object_id,
          attributionParams
        );

        const response = {
          attribution_data: result.data,
          summary: calculateAttributionMetrics(result.data),
          query_parameters: attributionParams,
          total_records: result.data.length,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [
            {
              type: "text",
              text: `Error getting attribution data: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

// Helper Functions

function calculateSummaryMetrics(insights: AdInsights[]): any {
  if (insights.length === 0) {
    return {
      total_impressions: 0,
      total_clicks: 0,
      total_spend: 0,
      average_ctr: 0,
      average_cpc: 0,
      average_cpm: 0,
      total_reach: 0,
      average_frequency: 0,
    };
  }

  const totals = insights.reduce(
    (acc, insight) => {
      acc.impressions += parseFloat(insight.impressions || "0");
      acc.clicks += parseFloat(insight.clicks || "0");
      acc.spend += parseFloat(insight.spend || "0");
      acc.reach += parseFloat(insight.reach || "0");
      return acc;
    },
    { impressions: 0, clicks: 0, spend: 0, reach: 0 }
  );

  const averageCtr =
    totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const averageCpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const averageCpm =
    totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
  const averageFrequency =
    totals.reach > 0 ? totals.impressions / totals.reach : 0;

  return {
    total_impressions: Math.round(totals.impressions),
    total_clicks: Math.round(totals.clicks),
    total_spend: Math.round(totals.spend * 100) / 100, // Round to 2 decimal places
    average_ctr: Math.round(averageCtr * 100) / 100,
    average_cpc: Math.round(averageCpc * 100) / 100,
    average_cpm: Math.round(averageCpm * 100) / 100,
    total_reach: Math.round(totals.reach),
    average_frequency: Math.round(averageFrequency * 100) / 100,
    date_range: {
      start: insights[0]?.date_start,
      end: insights[insights.length - 1]?.date_stop,
    },
  };
}

function calculatePerformanceRankings(
  comparisons: any[],
  metrics: string[]
): any {
  const rankings: any = {};

  for (const metric of metrics) {
    const validComparisons = comparisons.filter((c) => c.metrics && !c.error);

    if (validComparisons.length === 0) continue;

    const sorted = validComparisons
      .map((c) => ({
        object_id: c.object_id,
        object_name: c.object_name,
        value: getMetricValue(c.metrics, metric),
      }))
      .filter((item) => item.value !== null)
      .sort((a, b) => {
        // Higher is better for most metrics except cost metrics
        const isCostMetric =
          metric.includes("cpc") ||
          metric.includes("cpm") ||
          metric.includes("spend");
        return isCostMetric
          ? (a.value || 0) - (b.value || 0)
          : (b.value || 0) - (a.value || 0);
      });

    rankings[metric] = sorted.map((item, index) => ({
      rank: index + 1,
      object_id: item.object_id,
      object_name: item.object_name,
      value: item.value,
    }));
  }

  return rankings;
}

function getMetricValue(metrics: any, metricName: string): number | null {
  const value =
    metrics[`total_${metricName}`] ||
    metrics[`average_${metricName}`] ||
    metrics[metricName];
  return value !== undefined ? parseFloat(value) : null;
}

function calculateAttributionMetrics(insights: AdInsights[]): any {
  const attributionSummary: any = {
    total_conversions: 0,
    attribution_windows: {},
    cost_per_conversion: 0,
    conversion_rate: 0,
  };

  insights.forEach((insight) => {
    if (insight.actions) {
      insight.actions.forEach((action) => {
        if (
          action.action_type === "purchase" ||
          action.action_type === "complete_registration"
        ) {
          attributionSummary.total_conversions += parseFloat(action.value);
        }
      });
    }
  });

  const totalSpend = insights.reduce(
    (sum, insight) => sum + parseFloat(insight.spend || "0"),
    0
  );
  const totalClicks = insights.reduce(
    (sum, insight) => sum + parseFloat(insight.clicks || "0"),
    0
  );

  if (attributionSummary.total_conversions > 0) {
    attributionSummary.cost_per_conversion =
      totalSpend / attributionSummary.total_conversions;
  }

  if (totalClicks > 0) {
    attributionSummary.conversion_rate =
      (attributionSummary.total_conversions / totalClicks) * 100;
  }

  return attributionSummary;
}

function convertToCSV(data: AdInsights[]): string {
  if (data.length === 0) return "";

  // Get all unique keys from the data
  const headers = new Set<string>();
  data.forEach((row) => {
    Object.keys(row).forEach((key) => headers.add(key));
  });

  const headerArray = Array.from(headers);
  const csvRows = [headerArray.join(",")];

  data.forEach((row) => {
    const values = headerArray.map((header) => {
      const value = (row as any)[header];
      if (value === null || value === undefined) return "";
      if (typeof value === "object") return JSON.stringify(value);
      return String(value).replace(/"/g, '""'); // Escape quotes
    });
    csvRows.push(values.map((v) => `"${v}"`).join(","));
  });

  return csvRows.join("\n");
}

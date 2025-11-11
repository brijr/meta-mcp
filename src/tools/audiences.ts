import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaApiClient } from "../meta-client.js";
import {
  ListAudiencesSchema,
  CreateCustomAudienceSchema,
  CreateLookalikeAudienceSchema,
  EstimateAudienceSizeSchema,
} from "../types/mcp-tools.js";

export function setupAudienceTools(
  server: McpServer,
  metaClient: MetaApiClient
) {
  registerAudienceTools(server, metaClient);
}

export function registerAudienceTools(
  server: McpServer,
  metaClient: MetaApiClient
) {
  // List Audiences Tool
  server.tool(
    "list_audiences",
    ListAudiencesSchema.shape,
    async ({ account_id, type, limit, after }) => {
      try {
        const result = await metaClient.getCustomAudiences(account_id, {
          limit,
          after,
        });

        // Filter by type if specified
        let audiences = result.data;
        if (type) {
          audiences = audiences.filter((audience) => {
            if (type === "custom") return audience.subtype !== "LOOKALIKE";
            if (type === "lookalike") return audience.subtype === "LOOKALIKE";
            return true; // 'saved' would need different API endpoint
          });
        }

        const formattedAudiences = audiences.map((audience) => ({
          id: audience.id,
          name: audience.name,
          description: audience.description,
          type: audience.subtype === "LOOKALIKE" ? "lookalike" : "custom",
          subtype: audience.subtype,
          approximate_count: audience.approximate_count,
          data_source: audience.data_source,
          retention_days: audience.retention_days,
          creation_time: audience.creation_time,
          operation_status: audience.operation_status,
        }));

        const response = {
          audiences: formattedAudiences,
          pagination: {
            has_next_page: result.hasNextPage,
            has_previous_page: result.hasPreviousPage,
            next_cursor: result.paging?.cursors?.after,
            previous_cursor: result.paging?.cursors?.before,
          },
          total_count: formattedAudiences.length,
          filter_applied: type || "all",
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
              text: `Error listing audiences: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Create Custom Audience Tool
  server.tool(
    "create_custom_audience",
    CreateCustomAudienceSchema.shape,
    async ({
      account_id,
      name,
      description,
      subtype,
      customer_file_source,
      retention_days,
      rule,
    }) => {
      try {
        const audienceData: any = {
          name,
          subtype,
        };

        if (description) audienceData.description = description;
        if (customer_file_source)
          audienceData.customer_file_source = customer_file_source;
        if (retention_days) audienceData.retention_days = retention_days;
        if (rule) audienceData.rule = rule;

        const result = await metaClient.createCustomAudience(
          account_id,
          audienceData
        );

        const response = {
          success: true,
          audience_id: result.id,
          message: `Custom audience "${name}" created successfully`,
          details: {
            id: result.id,
            name,
            subtype,
            account_id,
            description,
            retention_days,
          },
          next_steps: [
            "Upload customer data to populate the audience",
            "Wait for the audience to process (may take a few hours)",
            "Use the audience in ad targeting once it's ready",
          ],
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
              text: `Error creating custom audience: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Create Lookalike Audience Tool
  server.tool(
    "create_lookalike_audience",
    CreateLookalikeAudienceSchema.shape,
    async ({
      account_id,
      name,
      origin_audience_id,
      country,
      ratio,
      description,
    }) => {
      try {
        if (ratio < 0.01 || ratio > 0.2) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Ratio must be between 0.01 (1%) and 0.2 (20%)",
              },
            ],
            isError: true,
          };
        }

        const audienceData: any = {
          name,
          origin_audience_id,
          country,
          ratio,
        };

        if (description) audienceData.description = description;

        const result = await metaClient.createLookalikeAudience(
          account_id,
          audienceData
        );

        const response = {
          success: true,
          audience_id: result.id,
          message: `Lookalike audience "${name}" created successfully`,
          details: {
            id: result.id,
            name,
            origin_audience_id,
            country,
            ratio: `${ratio * 100}%`,
            account_id,
            description,
          },
          estimated_processing_time: "6-24 hours",
          next_steps: [
            "Wait for the lookalike audience to finish processing",
            "Check the audience size once processing is complete",
            "Use the audience in ad targeting",
          ],
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
              text: `Error creating lookalike audience: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Estimate Audience Size Tool
  server.tool(
    "estimate_audience_size",
    EstimateAudienceSizeSchema.shape,
    async ({ account_id, targeting, optimization_goal }) => {
      try {
        const estimate = await metaClient.estimateAudienceSize(
          account_id,
          targeting,
          optimization_goal
        );

        // Format the numbers for better readability
        const formatNumber = (num: number) => {
          if (num >= 1000000) {
            return `${(num / 1000000).toFixed(1)}M`;
          } else if (num >= 1000) {
            return `${(num / 1000).toFixed(1)}K`;
          }
          return num.toString();
        };

        const response = {
          estimate: {
            monthly_active_users: estimate.estimate_mau,
            daily_active_users: estimate.estimate_dau,
            formatted: {
              monthly_active_users: formatNumber(estimate.estimate_mau),
              daily_active_users: estimate.estimate_dau
                ? formatNumber(estimate.estimate_dau)
                : "N/A",
            },
          },
          targeting_parameters: targeting,
          optimization_goal,
          recommendations: generateTargetingRecommendations(
            estimate.estimate_mau
          ),
          account_id,
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
              text: `Error estimating audience size: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Update Audience Tool (for custom audiences)
  server.tool(
    "update_custom_audience",
    CreateCustomAudienceSchema.shape,
    async ({ name, description, retention_days }) => {
      try {
        // Note: This is a simplified version. The actual Meta API endpoint would be different
        // For now, we'll return a structure showing what could be updated

        const response = {
          message: "Custom audience update parameters validated",
          updatable_fields: {
            name: name || "No change",
            description: description || "No change",
            retention_days: retention_days || "No change",
          },
          note: "Custom audience updates require specific API calls for adding/removing users",
          available_operations: [
            "Add users to audience",
            "Remove users from audience",
            "Update audience metadata",
            "Delete audience",
          ],
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
              text: `Error updating custom audience: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Delete Audience Tool
  server.tool("delete_audience", ListAudiencesSchema.shape, async () => {
    try {
      // Note: This would require an audience_id parameter in a real implementation
      const response = {
        message: "Audience deletion requires audience_id parameter",
        required_parameters: ["audience_id"],
        warning: "Deleting an audience is permanent and cannot be undone",
        affected_campaigns:
          "Any campaigns using this audience will need to be updated",
        confirmation_required: true,
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
            text: `Error deleting audience: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Get Audience Insights Tool
  server.tool(
    "get_audience_insights",
    EstimateAudienceSizeSchema.shape,
    async ({ targeting }) => {
      try {
        // This would typically call a different endpoint for audience insights
        // For now, we'll provide a structured response showing what insights are available

        const response = {
          audience_demographics: {
            age_distribution: "Available with Meta Audience Insights API",
            gender_distribution: "Available with Meta Audience Insights API",
            location_breakdown: "Available with Meta Audience Insights API",
            interest_affinity: "Available with Meta Audience Insights API",
          },
          targeting_parameters: targeting,
          insights_note:
            "Detailed audience insights require additional API calls to Meta Audience Insights",
          recommended_actions: [
            "Use Facebook Audience Insights tool for detailed demographics",
            "Create test campaigns to gather performance data",
            "Use A/B testing to optimize targeting",
          ],
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
              text: `Error getting audience insights: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

// Helper Functions

function generateTargetingRecommendations(audienceSize: number): string[] {
  const recommendations: string[] = [];

  if (audienceSize < 1000) {
    recommendations.push(
      "Audience size is very small. Consider broadening your targeting criteria.",
      "Add additional interests or behaviors to reach more people.",
      "Consider using lookalike audiences based on your existing customers."
    );
  } else if (audienceSize < 10000) {
    recommendations.push(
      "Audience size is small but workable for niche targeting.",
      "Monitor performance closely as small audiences can have higher costs.",
      "Consider testing broader targeting to find additional relevant users."
    );
  } else if (audienceSize < 100000) {
    recommendations.push(
      "Good audience size for most campaign objectives.",
      "You have room to test different creative approaches.",
      "Consider creating exclusion audiences to avoid overlap."
    );
  } else if (audienceSize < 1000000) {
    recommendations.push(
      "Large audience size - good for reach and awareness campaigns.",
      "Consider using detailed targeting expansion for optimization.",
      "You may benefit from breaking this into smaller, more specific audiences."
    );
  } else {
    recommendations.push(
      "Very large audience - consider narrowing your targeting.",
      "Use additional demographic or interest filters to improve relevance.",
      "Large audiences work well for brand awareness but may be less efficient for conversions."
    );
  }

  // Add general recommendations
  recommendations.push(
    "Test different audience sizes to find the optimal balance of reach and relevance.",
    "Use Facebook's detailed targeting expansion when appropriate.",
    "Monitor frequency to avoid ad fatigue in smaller audiences."
  );

  return recommendations;
}

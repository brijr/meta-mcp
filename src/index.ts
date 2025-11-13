#!/usr/bin/env node

import { config } from "dotenv";
config({ path: ".env.local" }); // Load environment variables from .env.local file

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MetaApiClient } from "./meta-client.js";
import { AuthManager } from "./utils/auth.js";
import { registerCampaignTools } from "./tools/campaigns.js";
import { registerAnalyticsTools } from "./tools/analytics.js";
import { registerAudienceTools } from "./tools/audiences.js";
import { registerCreativeTools } from "./tools/creatives.js";
import { registerOAuthTools } from "./tools/oauth.js";
import { registerCampaignResources } from "./resources/campaigns.js";
import { registerInsightsResources } from "./resources/insights.js";
import { registerAudienceResources } from "./resources/audiences.js";

async function main() {
  try {
    console.error("🚀 Starting Meta Marketing API MCP Server...");
    console.error("📋 Environment check:");
    console.error(`   NODE_VERSION: ${process.version}`);
    console.error(
      `   META_ACCESS_TOKEN: ${
        process.env.META_ACCESS_TOKEN ? "Present" : "Missing"
      }`,
    );
    console.error(
      `   MCP_SERVER_NAME: ${process.env.MCP_SERVER_NAME || "Not set"}`,
    );

    // Initialize authentication
    console.error("🔐 Initializing authentication...");
    const auth = AuthManager.fromEnvironment();
    console.error("✅ Auth manager created successfully");

    // Validate and refresh token if needed
    console.error("🔍 Validating Meta access token...");
    try {
      const currentToken = await auth.refreshTokenIfNeeded();
      console.error("✅ Token validation and refresh successful");
      console.error(`🔑 Token ready: ${currentToken.substring(0, 20)}...`);

      // Log OAuth configuration status
      const hasOAuthConfig = !!(
        process.env.META_APP_ID && process.env.META_APP_SECRET
      );
      console.error(
        `🔧 OAuth configuration: ${
          hasOAuthConfig ? "Available" : "Not configured"
        }`,
      );
      console.error(
        `🔄 Auto-refresh: ${
          process.env.META_AUTO_REFRESH === "true" ? "Enabled" : "Disabled"
        }`,
      );
    } catch (error) {
      console.error("❌ Token validation failed:", error);
      console.error(
        "💡 Use OAuth tools to obtain a new token or check configuration",
      );
      process.exit(1);
    }

    // Initialize Meta API client
    console.error("🌐 Initializing Meta API client...");
    const metaClient = new MetaApiClient(auth);
    console.error("✅ Meta API client created successfully");

    // Initialize MCP Server
    console.error("🔧 Initializing MCP Server...");
    const server = new McpServer({
      name: process.env.MCP_SERVER_NAME || "Meta Marketing API Server",
      version: process.env.MCP_SERVER_VERSION || "1.0.0",
    });
    console.error("✅ MCP Server instance created");

    // Register all tools
    console.error("🛠️  Registering tools...");
    registerCampaignTools(server, metaClient);
    console.error("   ✅ Campaign tools registered");
    registerAnalyticsTools(server, metaClient);
    console.error("   ✅ Analytics tools registered");
    registerAudienceTools(server, metaClient);
    console.error("   ✅ Audience tools registered");
    registerCreativeTools(server, metaClient);
    console.error("   ✅ Creative tools registered");
    registerOAuthTools(server, auth);
    console.error("   ✅ OAuth tools registered");

    // Register all resources
    console.error("📚 Registering resources...");
    registerCampaignResources(server, metaClient);
    console.error("   ✅ Campaign resources registered");
    registerInsightsResources(server, metaClient);
    console.error("   ✅ Insights resources registered");
    registerAudienceResources(server, metaClient);
    console.error("   ✅ Audience resources registered");

    // Add account discovery tool
    server.tool("get_ad_accounts", {}, async () => {
      try {
        const accounts = await metaClient.getAdAccounts();

        const accountsData = accounts.map((account) => ({
          id: account.id,
          name: account.name,
          account_status: account.account_status,
          currency: account.currency,
          timezone_name: account.timezone_name,
          balance: account.balance,
          business: account.business
            ? {
                id: account.business.id,
                name: account.business.name,
              }
            : null,
        }));

        const response = {
          success: true,
          accounts: accountsData,
          total_accounts: accountsData.length,
          message: "Ad accounts retrieved successfully",
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
              text: `Error getting ad accounts: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });

    // Add server health check tool
    server.tool("health_check", {}, async () => {
      try {
        const accounts = await metaClient.getAdAccounts();
        const response = {
          status: "healthy",
          server_name: "Meta Marketing API Server",
          version: "1.0.0",
          timestamp: new Date().toISOString(),
          meta_api_connection: "connected",
          accessible_accounts: accounts.length,
          rate_limit_status: "operational",
          features: {
            campaign_management: true,
            analytics_reporting: true,
            audience_management: true,
            creative_management: true,
            real_time_insights: true,
          },
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
        const response = {
          status: "unhealthy",
          server_name: "Meta Marketing API Server",
          version: "1.0.0",
          timestamp: new Date().toISOString(),
          error: errorMessage,
          meta_api_connection: "failed",
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2),
            },
          ],
          isError: true,
        };
      }
    });

    // Add server capabilities info
    server.tool("get_capabilities", {}, async () => {
      const capabilities = {
        server_info: {
          name: "Meta Marketing API Server",
          version: "1.0.0",
          description:
            "MCP server providing access to Meta Marketing API for campaign management, analytics, and audience targeting",
        },
        api_coverage: {
          campaigns: {
            description: "Full campaign lifecycle management",
            operations: [
              "create",
              "read",
              "update",
              "delete",
              "pause",
              "resume",
            ],
            supported_objectives: [
              "OUTCOME_APP_PROMOTION",
              "OUTCOME_AWARENESS",
              "OUTCOME_ENGAGEMENT",
              "OUTCOME_LEADS",
              "OUTCOME_SALES",
              "OUTCOME_TRAFFIC",
            ],
          },
          ad_sets: {
            description: "Ad set management and targeting",
            operations: ["create", "read", "update", "list"],
            targeting_options: [
              "demographics",
              "interests",
              "behaviors",
              "custom_audiences",
              "lookalike_audiences",
              "geographic",
            ],
          },
          ads: {
            description: "Individual ad management",
            operations: ["create", "read", "update", "list"],
            supported_formats: [
              "single_image",
              "carousel",
              "video",
              "collection",
            ],
          },
          insights: {
            description: "Performance analytics and reporting",
            metrics: [
              "impressions",
              "clicks",
              "spend",
              "reach",
              "frequency",
              "ctr",
              "cpc",
              "cpm",
              "conversions",
            ],
            breakdowns: ["age", "gender", "placement", "device", "country"],
            date_ranges: [
              "today",
              "yesterday",
              "last_7d",
              "last_30d",
              "last_90d",
              "custom",
            ],
          },
          audiences: {
            description: "Custom and lookalike audience management",
            types: ["custom", "lookalike", "website", "app", "offline"],
            operations: ["create", "read", "update", "delete", "estimate_size"],
          },
          creatives: {
            description: "Ad creative management and testing",
            operations: ["create", "read", "preview", "ab_test_setup"],
            formats: ["image", "video", "carousel", "collection"],
          },
        },
        tools_available: [
          // Campaign tools
          "list_campaigns",
          "create_campaign",
          "update_campaign",
          "delete_campaign",
          "pause_campaign",
          "resume_campaign",
          "get_campaign",
          // Ad set tools
          "list_ad_sets",
          "create_ad_set",
          "create_ad_set_enhanced",
          "list_campaign_ad_sets",
          // Ad tools
          "list_ads",
          "create_ad",
          // Analytics tools
          "get_insights",
          "compare_performance",
          "export_insights",
          "get_campaign_performance",
          "get_attribution_data",
          // Audience tools
          "list_audiences",
          "create_custom_audience",
          "create_lookalike_audience",
          "estimate_audience_size",
          // Creative tools
          "list_creatives",
          "create_ad_creative",
          "validate_creative_setup",
          "validate_creative_enhanced",
          "preview_ad",
          "get_creative_best_practices",
          "troubleshoot_creative_issues",
          "analyze_account_creatives",
          "upload_creative_asset",
          "upload_image_from_url",
          "check_api_v23_compliance",
          "get_meta_error_codes",
          "setup_ab_test",
          "get_creative_performance",
          "update_creative",
          "delete_creative",
          // OAuth tools
          "generate_auth_url",
          "exchange_code_for_token",
          "refresh_to_long_lived_token",
          "generate_system_user_token",
          "get_token_info",
          "validate_token",
          // Diagnostic & Helper tools
          "check_campaign_readiness",
          "get_meta_api_reference",
          "get_quick_fixes",
          "verify_account_setup",
          // Utility tools
          "get_ad_accounts",
          "health_check",
          "get_capabilities",
          "get_ai_guidance",
        ],
        resources_available: [
          "meta://campaigns/{account_id}",
          "meta://campaign/{campaign_id}",
          "meta://campaign-status/{account_id}",
          "meta://adsets/{campaign_id}",
          "meta://insights/campaign/{campaign_id}",
          "meta://insights/account/{account_id}",
          "meta://insights/compare/{object_ids}",
          "meta://insights/trends/{object_id}/{days}",
          "meta://audiences/{account_id}",
          "meta://audience-performance/{account_id}",
          "meta://targeting-insights/{account_id}",
          "meta://audience-health/{account_id}",
        ],
        rate_limits: {
          development_tier: {
            max_score: 60,
            decay_time: "5 minutes",
            block_time: "5 minutes",
          },
          standard_tier: {
            max_score: 9000,
            decay_time: "5 minutes",
            block_time: "1 minute",
          },
          scoring: {
            read_calls: 1,
            write_calls: 3,
          },
        },
        authentication: {
          required: ["META_ACCESS_TOKEN"],
          optional: [
            "META_APP_ID",
            "META_APP_SECRET",
            "META_BUSINESS_ID",
            "META_REDIRECT_URI",
            "META_REFRESH_TOKEN",
            "META_AUTO_REFRESH",
          ],
          token_validation: "automatic_on_startup",
          oauth_support: {
            authorization_flow: "supported",
            token_refresh: "automatic_with_configuration",
            system_user_tokens: "supported",
            long_lived_tokens: "supported",
          },
        },
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(capabilities, null, 2),
          },
        ],
      };
    });

    // Add AI workflow guidance tool
    server.tool(
      "get_ai_guidance",
      "Get comprehensive guidance for AI assistants on how to effectively use this Meta Marketing API server. Includes common workflows, tool combinations, troubleshooting tips, and best practices for campaign management and analytics.",
      {},
      async () => {
        const guidance = {
          server_purpose: {
            description:
              "This MCP server provides comprehensive access to Meta (Facebook/Instagram) advertising capabilities including campaign management, performance analytics, audience targeting, and creative optimization.",
            primary_use_cases: [
              "Campaign performance analysis and optimization",
              "Automated campaign creation and management",
              "Audience research and targeting insights",
              "Creative performance testing and analysis",
              "Budget management and ROI optimization",
              "Multi-account advertising workflow automation",
            ],
          },
          common_workflows: {
            campaign_analysis: {
              description:
                "Analyze campaign performance and identify optimization opportunities",
              step_by_step: [
                "1. Use 'get_ad_accounts' to list available accounts",
                "2. Use 'list_campaigns' to see all campaigns in an account",
                "3. Use 'get_insights' with campaign IDs to get performance metrics",
                "4. Use 'compare_performance' to compare multiple campaigns",
                "5. Use 'export_insights' to save data in CSV/JSON format",
              ],
              key_tools: [
                "get_ad_accounts",
                "list_campaigns",
                "get_insights",
                "compare_performance",
                "export_insights",
              ],
            },
            new_campaign_setup: {
              description: "Create and launch a new advertising campaign",
              step_by_step: [
                "1. Use 'get_ad_accounts' to select the target account",
                "2. Use 'create_campaign' with objective and budget settings",
                "3. Use 'create_ad_set' to define targeting and optimization",
                "4. Use 'create_ad_creative' to set up ad content and visuals",
                "5. Use 'create_ad' to link creative to ad set",
                "6. Use 'resume_campaign' to activate when ready",
              ],
              key_tools: [
                "create_campaign",
                "create_ad_set",
                "create_ad_creative",
                "create_ad",
                "resume_campaign",
              ],
            },
            audience_research: {
              description:
                "Research and create targeted audiences for campaigns",
              step_by_step: [
                "1. Use 'list_audiences' to see existing custom audiences",
                "2. Use 'create_custom_audience' for new audience segments",
                "3. Use 'create_lookalike_audience' based on high-value customers",
                "4. Use 'get_audience_info' to check audience size and health",
                "5. Use targeting insights from 'get_insights' to refine",
              ],
              key_tools: [
                "list_audiences",
                "create_custom_audience",
                "create_lookalike_audience",
                "get_audience_info",
              ],
            },
            creative_optimization: {
              description:
                "Test and optimize ad creatives for better performance",
              step_by_step: [
                "1. Use 'list_creatives' to see existing ad creatives",
                "2. Use 'create_ad_creative' to test new variations",
                "3. Use 'validate_creative_setup' to check before launch",
                "4. Use 'get_insights' with ad-level breakdown to compare creative performance",
                "5. Use 'export_insights' to analyze creative performance data",
              ],
              key_tools: [
                "list_creatives",
                "create_ad_creative",
                "validate_creative_setup",
                "get_insights",
              ],
            },
            troubleshooting_and_diagnostics: {
              description:
                "Diagnose and fix common Meta Ads API issues with enhanced error handling",
              step_by_step: [
                "1. Use 'verify_account_setup' to check overall account readiness",
                "2. Use 'check_campaign_readiness' before creating ad sets",
                "3. Use 'get_meta_api_reference' for valid parameter combinations",
                "4. Use 'get_quick_fixes' with error messages for specific solutions",
                "5. Use 'list_campaign_ad_sets' to see existing ad set structure",
              ],
              key_tools: [
                "verify_account_setup",
                "check_campaign_readiness",
                "get_meta_api_reference",
                "get_quick_fixes",
                "list_campaign_ad_sets",
              ],
            },
            budget_optimization: {
              description: "Monitor and optimize campaign budgets and spending",
              step_by_step: [
                "1. Use 'get_insights' with spend metrics to check current performance",
                "2. Use 'compare_performance' to identify top-performing campaigns",
                "3. Use 'update_campaign' to adjust budgets based on performance",
                "4. Use 'pause_campaign' to stop underperforming campaigns",
                "5. Use 'resume_campaign' to reactivate optimized campaigns",
              ],
              key_tools: [
                "get_insights",
                "compare_performance",
                "update_campaign",
                "pause_campaign",
                "resume_campaign",
              ],
            },
          },
          tool_categories: {
            account_management: {
              tools: ["get_ad_accounts", "health_check", "get_token_info"],
              description: "Account access, authentication, and server status",
            },
            campaign_operations: {
              tools: [
                "list_campaigns",
                "create_campaign",
                "update_campaign",
                "pause_campaign",
                "resume_campaign",
              ],
              description: "Full campaign lifecycle management",
            },
            targeting_and_audiences: {
              tools: [
                "list_audiences",
                "create_custom_audience",
                "create_lookalike_audience",
                "get_audience_info",
              ],
              description: "Audience creation, management, and insights",
            },
            creative_management: {
              tools: [
                "list_creatives",
                "create_ad_creative",
                "validate_creative_setup",
              ],
              description: "Ad creative creation, validation, and management",
            },
            performance_analytics: {
              tools: ["get_insights", "compare_performance", "export_insights"],
              description: "Performance metrics, analysis, and reporting",
            },
            ad_management: {
              tools: [
                "list_ad_sets",
                "create_ad_set",
                "create_ad_set_enhanced",
                "list_campaign_ad_sets",
                "list_ads",
                "create_ad",
              ],
              description: "Ad set and individual ad management",
            },
            diagnostic_and_troubleshooting: {
              tools: [
                "check_campaign_readiness",
                "get_meta_api_reference",
                "get_quick_fixes",
                "verify_account_setup",
              ],
              description:
                "Error diagnosis, troubleshooting, and validation tools",
            },
          },
          best_practices: {
            error_handling: [
              "Always check health_check before starting major operations",
              "Use get_ad_accounts to verify account access before campaign operations",
              "Use validate_creative_setup before creating ad creatives",
              "Handle rate limiting by spacing out API calls appropriately",
            ],
            performance_optimization: [
              "Use compare_performance to identify patterns across campaigns",
              "Export insights data for deeper analysis with export_insights",
              "Monitor budget utilization with regular get_insights calls",
              "Test multiple creatives per ad set for better performance",
            ],
            workflow_efficiency: [
              "Start with list operations to understand current state",
              "Group related operations together (create campaign → ad set → creative → ad)",
              "Use descriptive names for campaigns and ad sets for better organization",
              "Regular performance monitoring to catch issues early",
            ],
          },
          troubleshooting: {
            authentication_issues: [
              "Use get_token_info to check token validity and permissions",
              "Verify account access with get_ad_accounts",
              "Check server status with health_check",
            ],
            campaign_creation_failures: [
              "Verify account permissions with get_ad_accounts",
              "Check required fields in create_campaign parameters",
              "Ensure budget amounts meet minimum requirements",
              "Validate campaign objectives are supported",
            ],
            creative_validation_errors: [
              "Use validate_creative_setup before create_ad_creative",
              "Ensure page_id is valid and accessible",
              "Check image URLs are accessible and meet specifications",
              "Verify call-to-action types are supported",
            ],
            performance_data_issues: [
              "Check date ranges are valid and not too historical",
              "Verify object IDs exist and are accessible",
              "Use smaller date ranges for better data availability",
              "Check if campaigns were active during requested date ranges",
            ],
          },
          rate_limiting_guidance: {
            description:
              "Meta API has strict rate limits that vary by access level",
            best_practices: [
              "Space out API calls to avoid hitting rate limits",
              "Use batch operations when available",
              "Monitor rate limit headers in responses",
              "Implement exponential backoff for rate limit errors",
            ],
            limits_by_tier: {
              development: "60 points per 5 minutes",
              standard: "9000 points per 5 minutes",
            },
            point_costs: {
              read_operations: "1 point each",
              write_operations: "3 points each",
            },
          },
          next_steps_suggestions: [
            "Start with health_check to verify server connectivity",
            "Use get_ad_accounts to see available accounts",
            "Explore existing campaigns with list_campaigns",
            "Check current performance with get_insights",
            "Review available audiences with list_audiences",
            "Examine creative assets with list_creatives",
          ],
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(guidance, null, 2),
            },
          ],
        };
      },
    );

    console.error("🔗 Connecting to MCP transport...");
    console.error(
      `📊 Server: ${
        process.env.MCP_SERVER_NAME || "Meta Marketing API Server"
      } v${process.env.MCP_SERVER_VERSION || "1.0.0"}`,
    );
    console.error(`🔧 Meta API Version: ${auth.getApiVersion()}`);

    // Connect to transport
    console.error("🚀 Attempting server connection...");
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("✅ Transport connection established");

    console.error("✅ Meta Marketing API MCP Server started successfully");
    console.error("🎯 Ready to receive requests from MCP clients");
    console.error("🔄 Server is now running and listening...");
  } catch (error) {
    console.error("❌ Failed to start Meta Marketing API MCP Server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.error("Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Start the server automatically (this is a CLI tool)
main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

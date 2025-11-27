import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";
import { MetaApiClient } from "../src/meta-client.js";
import { UserAuthManager } from "../src/utils/user-auth.js";

// Create a wrapper to handle authentication at the request level
const handler = async (req: Request) => {
  console.log("🌐 Incoming request to MCP handler");

  // Extract auth header from the actual request
  const authHeader = req.headers.get("authorization");
  console.log("🔑 Auth header present:", !!authHeader);

  return createMcpHandler(
    (server) => {
      console.log("🚀 MCP server starting");

      // Health check tool (with authentication)
      server.tool(
        "health_check",
        "Check server health and authentication status",
        {},
        async (args, context) => {
          try {
            console.log("🔍 Health check starting");
            console.log("Auth header available:", !!authHeader);
            if (!authHeader) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        status: "unhealthy",
                        error:
                          "Authentication required: Missing Authorization header",
                        timestamp: new Date().toISOString(),
                      },
                      null,
                      2
                    ),
                  },
                ],
                isError: true,
              };
            }

            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        status: "unhealthy",
                        error: "Invalid authentication token",
                        timestamp: new Date().toISOString(),
                      },
                      null,
                      2
                    ),
                  },
                ],
                isError: true,
              };
            }

            console.log("✅ Health check passed");
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "healthy",
                      server_name: "Meta Marketing API Server",
                      version: "1.7.0",
                      timestamp: new Date().toISOString(),
                      deployment: "vercel",
                      user: {
                        id: user.userId,
                        name: user.name,
                        email: user.email,
                      },
                      features: {
                        authentication: "oauth_required",
                        campaign_management: true,
                        analytics_reporting: true,
                      },
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error) {
            console.error("❌ Health check failed:", error);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "unhealthy",
                      error:
                        error instanceof Error
                          ? error.message
                          : "Unknown error",
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      // Get ad accounts tool
      server.tool(
        "get_ad_accounts",
        "Get list of accessible Meta ad accounts",
        {},
        async (args, context) => {
          try {
            console.log("📋 Get ad accounts starting");
            console.log("Using auth header from request scope:", !!authHeader);
            if (!authHeader) {
              throw new Error(
                "Authentication required: Missing Authorization header"
              );
            }

            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) {
              throw new Error("Invalid authentication token");
            }

            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth) {
              throw new Error("Failed to initialize user authentication");
            }

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();
            const accounts = await metaClient.getAdAccounts();

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      accounts: accounts.map((account) => ({
                        id: account.id,
                        name: account.name,
                        account_status: account.account_status,
                        currency: account.currency,
                        timezone_name: account.timezone_name,
                      })),
                      total_accounts: accounts.length,
                      message: "Ad accounts retrieved successfully",
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: ${
                    error instanceof Error ? error.message : "Unknown error"
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      // Get campaigns tool
      server.tool(
        "get_campaigns",
        "Get campaigns for an ad account",
        {
          account_id: z.string().describe("The ad account ID"),
          limit: z
            .number()
            .optional()
            .describe("Maximum number of campaigns to return (default: 25)"),
          status: z
            .array(z.string())
            .optional()
            .describe("Filter by campaign status (ACTIVE, PAUSED, etc.)"),
        },
        async ({ account_id, limit, status }, context) => {
          try {
            console.log("📋 Get campaigns starting for account:", account_id);
            if (!authHeader) {
              throw new Error(
                "Authentication required: Missing Authorization header"
              );
            }

            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) {
              throw new Error("Invalid authentication token");
            }

            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth) {
              throw new Error("Failed to initialize user authentication");
            }

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            const result = await metaClient.getCampaigns(account_id, {
              limit: limit || 25,
              status,
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      campaigns: result.data.map((campaign) => ({
                        id: campaign.id,
                        name: campaign.name,
                        objective: campaign.objective,
                        status: campaign.status,
                        effective_status: campaign.effective_status,
                        created_time: campaign.created_time,
                        daily_budget: campaign.daily_budget,
                        lifetime_budget: campaign.lifetime_budget,
                      })),
                      total: result.data.length,
                      account_id,
                      message: "Campaigns retrieved successfully",
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error: ${
                    error instanceof Error ? error.message : "Unknown error"
                  }`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      // Get insights tool for performance analytics
      server.tool(
        "get_insights",
        "Get performance insights for campaigns, ad sets, or ads",
        {
          object_id: z
            .string()
            .describe("The ID of the campaign, ad set, or ad"),
          level: z
            .enum(["account", "campaign", "adset", "ad"])
            .describe("The level of insights to retrieve"),
          date_preset: z
            .string()
            .optional()
            .describe("Date preset like 'last_7d', 'last_30d'"),
          time_range: z
            .object({
              since: z.string().describe("Start date (YYYY-MM-DD)"),
              until: z.string().describe("End date (YYYY-MM-DD)"),
            })
            .optional()
            .describe("Custom date range for insights"),
          time_increment: z
            .number()
            .min(1)
            .optional()
            .describe("Time increment for aggregation (e.g., 1 for daily)"),
          fields: z
            .array(z.string())
            .optional()
            .describe("Specific metrics to retrieve"),
          breakdowns: z
            .array(z.string())
            .optional()
            .describe("Breakdowns to segment insights (e.g., age, gender)"),
          limit: z.number().optional().describe("Number of results to return"),
        },
        async (
          {
            object_id,
            level,
            date_preset,
            time_range,
            time_increment,
            fields,
            breakdowns,
            limit,
          },
          context
        ) => {
          try {
            console.log("📊 Getting insights for:", object_id);

            if (!authHeader) {
              throw new Error("Authentication required");
            }

            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) {
              throw new Error("Invalid authentication token");
            }

            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth) {
              throw new Error("Failed to initialize user authentication");
            }

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            const params: Record<string, any> = {
              level,
              limit: limit || 25,
            };

            // Prefer explicit time_range over date_preset when provided
            if (time_range) {
              params.time_range = time_range;
            } else {
              params.date_preset = date_preset || "last_7d";
            }

            if (typeof time_increment === "number") {
              params.time_increment = time_increment;
            }

            if (fields && fields.length > 0) {
              params.fields = fields;
            }

            if (breakdowns && breakdowns.length > 0) {
              params.breakdowns = breakdowns;
            }

            const insights = await metaClient.getInsights(object_id, params);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      insights: insights,
                      object_id,
                      level,
                      date_preset: params.date_preset,
                      message: "Insights retrieved successfully",
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error) {
            console.error("❌ Get insights failed:", error);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: false,
                      error:
                        error instanceof Error
                          ? error.message
                          : "Unknown error",
                      object_id,
                      timestamp: new Date().toISOString(),
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      // Campaign Management Tools
      server.tool(
        "create_campaign",
        "Create a new advertising campaign",
        {
          account_id: z.string().describe("The ad account ID"),
          name: z.string().describe("Campaign name"),
          objective: z
            .string()
            .describe(
              "Campaign objective (OUTCOME_TRAFFIC, OUTCOME_LEADS, etc.)"
            ),
          status: z
            .enum(["ACTIVE", "PAUSED"])
            .optional()
            .describe("Campaign status"),
          budget_optimization: z
            .boolean()
            .optional()
            .describe("Enable campaign budget optimization"),
          daily_budget: z.number().optional().describe("Daily budget in cents"),
          lifetime_budget: z
            .number()
            .optional()
            .describe("Lifetime budget in cents"),
        },
        async ({
          account_id,
          name,
          objective,
          status,
          budget_optimization,
          daily_budget,
          lifetime_budget,
        }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            const campaignData: any = {
              name,
              objective,
              status: status || "PAUSED",
              special_ad_categories: [], // Empty array for no special categories
            };

            if (daily_budget) campaignData.daily_budget = daily_budget;
            if (lifetime_budget) campaignData.lifetime_budget = lifetime_budget;
            if (budget_optimization)
              campaignData.budget_optimization = budget_optimization;

            const campaign = await metaClient.createCampaign(
              account_id,
              campaignData
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ success: true, campaign }, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: false, error: error.message },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "update_campaign",
        "Update an existing campaign",
        {
          campaign_id: z.string().describe("Campaign ID to update"),
          name: z.string().optional().describe("New campaign name"),
          status: z
            .enum(["ACTIVE", "PAUSED"])
            .optional()
            .describe("Campaign status"),
          daily_budget: z.number().optional().describe("Daily budget in cents"),
          lifetime_budget: z
            .number()
            .optional()
            .describe("Lifetime budget in cents"),
        },
        async ({
          campaign_id,
          name,
          status,
          daily_budget,
          lifetime_budget,
        }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            const updates: any = {};
            if (name) updates.name = name;
            if (status) updates.status = status;
            if (daily_budget) updates.daily_budget = daily_budget;
            if (lifetime_budget) updates.lifetime_budget = lifetime_budget;

            const result = await metaClient.updateCampaign(
              campaign_id,
              updates
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ success: true, result }, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: false, error: error.message },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "pause_campaign",
        "Pause a campaign",
        {
          campaign_id: z.string().describe("Campaign ID to pause"),
        },
        async ({ campaign_id }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            await metaClient.updateCampaign(campaign_id, { status: "PAUSED" });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: true, message: "Campaign paused successfully" },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: false, error: error.message },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "resume_campaign",
        "Resume/activate a paused campaign",
        {
          campaign_id: z.string().describe("Campaign ID to resume"),
        },
        async ({ campaign_id }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            await metaClient.updateCampaign(campaign_id, { status: "ACTIVE" });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: true, message: "Campaign resumed successfully" },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: false, error: error.message },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      // Ad Set Management Tools
      server.tool(
        "create_ad_set",
        "Create a new ad set within a campaign",
        {
          campaign_id: z
            .string()
            .describe("The campaign ID to create the ad set in"),
          name: z.string().describe("Ad set name"),
          optimization_goal: z
            .enum([
              "REACH",
              "IMPRESSIONS",
              "CLICKS",
              "UNIQUE_CLICKS",
              "APP_INSTALLS",
              "OFFSITE_CONVERSIONS",
              "CONVERSIONS",
              "LINK_CLICKS",
              "POST_ENGAGEMENT",
              "PAGE_LIKES",
              "EVENT_RESPONSES",
              "MESSAGES",
              "APP_DOWNLOADS",
              "LANDING_PAGE_VIEWS",
            ])
            .describe("Optimization goal"),
          billing_event: z
            .enum([
              "IMPRESSIONS",
              "CLICKS",
              "APP_INSTALLS",
              "OFFSITE_CONVERSIONS",
              "CONVERSIONS",
              "LINK_CLICKS",
              "NONE",
            ])
            .describe("What you pay for"),
          daily_budget: z
            .number()
            .optional()
            .describe("Daily budget in cents (minimum 100 = $1)"),
          lifetime_budget: z
            .number()
            .optional()
            .describe("Lifetime budget in cents"),
          bid_strategy: z
            .enum([
              "LOWEST_COST_WITHOUT_CAP",
              "LOWEST_COST_WITH_BID_CAP",
              "COST_CAP",
            ])
            .optional(),
          status: z
            .enum(["ACTIVE", "PAUSED"])
            .optional()
            .describe("Ad set status"),
          // Simplified targeting - start basic
          countries: z
            .array(z.string())
            .optional()
            .describe("Country codes (e.g., ['US', 'CA'])"),
          age_min: z
            .number()
            .min(13)
            .max(65)
            .optional()
            .describe("Minimum age (13-65)"),
          age_max: z
            .number()
            .min(13)
            .max(65)
            .optional()
            .describe("Maximum age (13-65)"),
          genders: z
            .array(z.enum(["1", "2"]))
            .optional()
            .describe("1=Male, 2=Female"),
          // Advanced targeting (optional)
          interests: z
            .array(z.string())
            .optional()
            .describe("Interest targeting IDs"),
          behaviors: z
            .array(z.string())
            .optional()
            .describe("Behavior targeting IDs"),
          custom_audiences: z
            .array(z.string())
            .optional()
            .describe("Custom audience IDs"),
        },
        async ({
          campaign_id,
          name,
          optimization_goal,
          billing_event,
          daily_budget,
          lifetime_budget,
          bid_strategy,
          status,
          countries,
          age_min,
          age_max,
          genders,
          interests,
          behaviors,
          custom_audiences,
        }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            // Build targeting object carefully
            const targeting: any = {};

            // Geographic targeting
            if (countries && countries.length > 0) {
              targeting.geo_locations = { countries };
            } else {
              // Default to US if no countries specified
              targeting.geo_locations = { countries: ["US"] };
            }

            // Age targeting
            if (age_min) targeting.age_min = age_min;
            if (age_max) targeting.age_max = age_max;

            // Gender targeting
            if (genders && genders.length > 0) {
              targeting.genders = genders.map((g) => parseInt(g));
            }

            // Interest targeting
            if (interests && interests.length > 0) {
              targeting.interests = interests.map((id) => ({ id }));
            }

            // Behavior targeting
            if (behaviors && behaviors.length > 0) {
              targeting.behaviors = behaviors.map((id) => ({ id }));
            }

            // Custom audience targeting
            if (custom_audiences && custom_audiences.length > 0) {
              targeting.custom_audiences = custom_audiences.map((id) => ({
                id,
              }));
            }

            // Build ad set data with required fields
            const adSetData: any = {
              name,
              campaign_id,
              targeting,
              optimization_goal,
              billing_event,
              status: status || "PAUSED",
            };

            // Budget (must have either daily or lifetime)
            // Meta API expects budget in account currency cents, not USD
            if (daily_budget) {
              adSetData.daily_budget = Math.max(daily_budget, 100); // Minimum based on currency
            } else if (lifetime_budget) {
              adSetData.lifetime_budget = Math.max(lifetime_budget, 100);
            } else {
              // Default to higher budget to avoid currency conversion issues
              adSetData.daily_budget = 1000; // $10 equivalent, adjusts for currency
            }

            // Bid strategy
            if (bid_strategy) {
              adSetData.bid_strategy = bid_strategy;
            }

            console.log(
              "📊 Creating ad set with data:",
              JSON.stringify(adSetData, null, 2)
            );

            const adSet = await metaClient.createAdSet(campaign_id, adSetData);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      ad_set: adSet,
                      message: "Ad set created successfully",
                      targeting_used: targeting,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error) {
            console.error("❌ Ad set creation failed:", error);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: false,
                      error: error.message,
                      troubleshooting: {
                        error_details: error.message,
                        common_fixes: [
                          "Ensure campaign is fully initialized (wait 1-2 minutes after creation)",
                          "Verify account has payment method configured",
                          "Check if Facebook Pixel is required for conversion campaigns",
                          "Try simpler targeting first (just countries and age)",
                          "Ensure minimum budget requirements are met ($1+ daily)",
                        ],
                        specific_guidance:
                          error.message.includes("payment") ||
                          error.message.includes("billing") ||
                          error.message.includes("funding")
                            ? "This appears to be a payment method issue. Please add a valid payment method in Meta Ads Manager."
                            : error.message.includes("permission") ||
                              error.message.includes("access")
                            ? "This appears to be a permissions issue. You may need admin access to the ad account."
                            : error.message.includes("budget") ||
                              error.message.includes("minimum")
                            ? "This appears to be a budget issue. Try increasing the daily budget to at least $5 (500 cents)."
                            : "Check the error message above for specific guidance.",
                      },
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "list_ad_sets",
        "List ad sets for a campaign",
        {
          campaign_id: z.string().describe("The campaign ID"),
          limit: z.number().optional().describe("Number of ad sets to return"),
          status: z.array(z.string()).optional().describe("Filter by status"),
        },
        async ({ campaign_id, limit, status }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            const params: any = { limit: limit || 25 };
            if (status) params.status = status;

            const adSets = await metaClient.getAdSets({
              campaignId: campaign_id,
              ...params,
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: true, ad_sets: adSets },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: false, error: error.message },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      // Ad Management Tools
      server.tool(
        "create_ad",
        "Create a new ad within an ad set",
        {
          ad_set_id: z.string().describe("The ad set ID to create the ad in"),
          name: z.string().describe("Ad name"),
          creative_id: z.string().describe("The ad creative ID to use"),
          status: z.enum(["ACTIVE", "PAUSED"]).optional().describe("Ad status"),
        },
        async ({ ad_set_id, name, creative_id, status }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            const adData = {
              name,
              adset_id: ad_set_id,
              creative: { creative_id },
              status: status || "PAUSED",
            };

            const ad = await metaClient.createAd(ad_set_id, adData);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ success: true, ad }, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: false, error: error.message },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "list_ads",
        "List ads for an ad set or campaign",
        {
          ad_set_id: z.string().optional().describe("The ad set ID"),
          campaign_id: z.string().optional().describe("The campaign ID"),
          account_id: z.string().optional().describe("The account ID"),
          limit: z.number().optional().describe("Number of ads to return"),
          status: z.array(z.string()).optional().describe("Filter by status"),
        },
        async ({ ad_set_id, campaign_id, account_id, limit, status }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            const params: any = { limit: limit || 25 };
            if (status) params.status = status;

            let ads;
            if (ad_set_id) {
              ads = await metaClient.getAds({
                adsetId: ad_set_id,
                ...params,
              });
            } else if (campaign_id) {
              ads = await metaClient.getAdsByCampaign(campaign_id, params);
            } else if (account_id) {
              ads = await metaClient.getAdsByAccount(account_id, params);
            } else {
              throw new Error(
                "Must provide ad_set_id, campaign_id, or account_id"
              );
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ success: true, ads }, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: false, error: error.message },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      // Additional Analytics Tools
      server.tool(
        "compare_performance",
        "Compare performance between multiple campaigns, ad sets, or ads",
        {
          object_ids: z
            .array(z.string())
            .describe("Array of campaign/ad set/ad IDs to compare"),
          level: z
            .enum(["campaign", "adset", "ad"])
            .describe("The level of comparison"),
          date_preset: z
            .string()
            .optional()
            .describe("Date preset like 'last_7d', 'last_30d'"),
          fields: z
            .array(z.string())
            .optional()
            .describe("Specific metrics to compare"),
        },
        async ({ object_ids, level, date_preset, fields }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            const results: any[] = [];
            for (const object_id of object_ids) {
              const params: Record<string, any> = {
                level,
                date_preset: date_preset || "last_7d",
              };
              if (fields && fields.length > 0) {
                params.fields = fields;
              }

              const insights = await metaClient.getInsights(object_id, params);
              results.push({ object_id, insights });
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: true, comparison: results },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: false, error: error.message },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "export_insights",
        "Export performance insights in various formats",
        {
          object_id: z.string().describe("Campaign/ad set/ad ID"),
          level: z
            .enum(["campaign", "adset", "ad"])
            .describe("The level of insights"),
          date_preset: z.string().optional().describe("Date preset"),
          format: z.enum(["json", "csv"]).optional().describe("Export format"),
          fields: z
            .array(z.string())
            .optional()
            .describe("Specific metrics to export"),
        },
        async ({ object_id, level, date_preset, format, fields }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            const params: Record<string, any> = {
              level,
              date_preset: date_preset || "last_7d",
            };
            if (fields && fields.length > 0) {
              params.fields = fields;
            }

            const insights = await metaClient.getInsights(object_id, params);

            let exportData: string;
            if (format === "csv" && insights.data && insights.data.length > 0) {
              // Convert to CSV format
              const headers = Object.keys(insights.data[0] || {});
              const csvRows = [headers.join(",")];
              insights.data.forEach((row: any) => {
                csvRows.push(
                  headers.map((header) => row[header] || "").join(",")
                );
              });
              exportData = csvRows.join("\n");
            } else {
              exportData = JSON.stringify(insights, null, 2);
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      format: format || "json",
                      data: exportData,
                      object_id,
                      level,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: false, error: error.message },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      // Audience Management Tools
      server.tool(
        "list_audiences",
        "List custom audiences for an ad account",
        {
          account_id: z.string().describe("The ad account ID"),
          limit: z
            .number()
            .optional()
            .describe("Number of audiences to return"),
        },
        async ({ account_id, limit }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            const audiences = await metaClient.getCustomAudiences(account_id, {
              limit: limit || 25,
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ success: true, audiences }, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: false, error: error.message },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "create_custom_audience",
        "Create a custom audience",
        {
          account_id: z.string().describe("The ad account ID"),
          name: z.string().describe("Audience name"),
          description: z.string().optional().describe("Audience description"),
          subtype: z
            .enum([
              "CUSTOM",
              "WEBSITE",
              "APP",
              "OFFLINE_CONVERSION",
              "CLAIM",
              "PARTNER",
              "MANAGED",
              "VIDEO",
              "LOOKALIKE",
              "ENGAGEMENT",
              "DATA_SET",
              "BAG_OF_ACCOUNTS",
              "STUDY_RULE_AUDIENCE",
              "FOX",
            ])
            .describe("Audience subtype"),
        },
        async ({ account_id, name, description, subtype }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            const audience = await metaClient.createCustomAudience(account_id, {
              name,
              description,
              subtype,
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ success: true, audience }, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: false, error: error.message },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "create_lookalike_audience",
        "Create a lookalike audience based on a source audience",
        {
          account_id: z.string().describe("The ad account ID"),
          name: z.string().describe("Lookalike audience name"),
          origin_audience_id: z.string().describe("Source audience ID"),
          country: z.string().describe("Target country code (e.g., 'US')"),
          ratio: z
            .number()
            .describe("Percentage of population to target (1-10)"),
          description: z.string().optional().describe("Audience description"),
        },
        async ({
          account_id,
          name,
          origin_audience_id,
          country,
          ratio,
          description,
        }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            const audience = await metaClient.createLookalikeAudience(
              account_id,
              {
                name,
                origin_audience_id,
                country,
                ratio,
                description,
              }
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ success: true, audience }, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: false, error: error.message },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "get_audience_info",
        "Get information about a custom audience",
        {
          audience_id: z.string().describe("The custom audience ID"),
        },
        async ({ audience_id }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            const audience = await metaClient.getCustomAudience(audience_id);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ success: true, audience }, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: false, error: error.message },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      // Creative Management Tools
      server.tool(
        "list_ad_creatives",
        "List ad creatives for an account",
        {
          account_id: z.string().describe("The ad account ID"),
          limit: z
            .number()
            .optional()
            .describe("Number of creatives to return"),
        },
        async ({ account_id, limit }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            const creatives = await metaClient.getAdCreatives(account_id, {
              limit: limit || 25,
            });

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ success: true, creatives }, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: false, error: error.message },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "create_ad_creative",
        "Create a new ad creative with v23.0 support for both external image URLs and uploaded image hashes. Supports enhanced CTA types and proper object_story_spec structure for Meta API compliance.",
        {
          account_id: z.string().describe("The ad account ID"),
          name: z.string().describe("Creative name"),
          page_id: z.string().describe("Facebook Page ID"),
          message: z.string().describe("Ad text/message"),
          link_url: z.string().describe("Destination URL"),
          picture: z
            .string()
            .optional()
            .describe("External image URL (alternative to image_hash)"),
          image_hash: z
            .string()
            .optional()
            .describe(
              "Pre-uploaded image hash (recommended for v23.0, use upload_image_from_url first)"
            ),
          call_to_action_type: z
            .enum([
              "LEARN_MORE",
              "SHOP_NOW",
              "SIGN_UP",
              "DOWNLOAD",
              "BOOK_TRAVEL",
              "LISTEN_MUSIC",
              "WATCH_VIDEO",
              "GET_QUOTE",
              "CONTACT_US",
              "APPLY_NOW",
              "GET_DIRECTIONS",
              "CALL_NOW",
              "MESSAGE_PAGE",
              "SUBSCRIBE",
              "BOOK_NOW",
              "ORDER_NOW",
              "DONATE_NOW",
            ])
            .optional()
            .describe("Call to action button (v23.0 enhanced list)"),
          headline: z.string().optional().describe("Ad headline"),
          description: z.string().optional().describe("Ad description"),
          instagram_actor_id: z
            .string()
            .optional()
            .describe("Instagram account ID (if posting to Instagram)"),
        },
        async ({
          account_id,
          name,
          page_id,
          message,
          link_url,
          picture,
          image_hash,
          call_to_action_type,
          headline,
          description,
          instagram_actor_id,
        }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            // v23.0 Validation
            if (!account_id.startsWith("act_")) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error (Meta API Code 100, Subcode 33): Invalid account ID format. Must include "act_" prefix. Use "act_${account_id}" instead of "${account_id}".`,
                  },
                ],
                isError: true,
              };
            }

            // Validate that we have either an image (URL or hash)
            if (!picture && !image_hash) {
              return {
                content: [
                  {
                    type: "text",
                    text: "Error: Either picture (image URL) or image_hash (pre-uploaded image) must be provided for the creative",
                  },
                ],
                isError: true,
              };
            }

            // Validate image vs hash usage (v23.0 best practice)
            if (picture && image_hash) {
              return {
                content: [
                  {
                    type: "text",
                    text: "Error: Cannot use both picture (external URL) and image_hash (uploaded image). Choose one method.",
                  },
                ],
                isError: true,
              };
            }

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            // Build object_story_spec with v23.0 image handling
            const link_data: any = {
              link: link_url,
              message: message,
            };

            // Use either external image URL or uploaded image hash (v23.0 compliant)
            if (picture) {
              link_data.picture = picture; // External URL
            } else if (image_hash) {
              link_data.image_hash = image_hash; // Pre-uploaded image hash (recommended)
            }

            if (headline) link_data.name = headline;
            if (description) link_data.description = description;
            if (call_to_action_type) {
              link_data.call_to_action = {
                type: call_to_action_type,
                value: { link: link_url },
              };
            }

            const object_story_spec: any = {
              page_id: page_id,
              link_data: link_data,
            };

            // Add Instagram support if provided
            if (instagram_actor_id) {
              object_story_spec.instagram_actor_id = instagram_actor_id;
            }

            const creativeData = {
              name,
              object_story_spec,
            };

            console.log(
              "🎨 Creating ad creative with v23.0 compliance:",
              JSON.stringify(creativeData, null, 2)
            );

            const creative = await metaClient.createAdCreative(
              account_id,
              creativeData
            );

            const imageMethod = image_hash
              ? "image_hash (recommended)"
              : "external_url";
            const imageValue = image_hash || picture;

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      creative,
                      message: `Ad creative "${name}" created successfully with v23.0 features`,
                      api_version: "v23.0",
                      image_method: imageMethod,
                      image_value: imageValue,
                      v23_compliance: {
                        account_format: "✅ Correct 'act_' prefix",
                        image_handling: image_hash
                          ? "✅ Using recommended image_hash method"
                          : "⚠️  Using external URL (consider upload_image_from_url for better performance)",
                        cta_support: call_to_action_type
                          ? `✅ Using v23.0 CTA: ${call_to_action_type}`
                          : "No CTA specified",
                      },
                      next_steps: [
                        "Test the creative with a small budget first",
                        "Monitor performance in Meta Ads Manager",
                        image_hash
                          ? "Image hash method provides optimal performance"
                          : "Consider using upload_image_from_url for future creatives",
                      ],
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error) {
            console.error("❌ Ad creative creation failed:", error);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: false,
                      error: error.message,
                      troubleshooting: {
                        image_url_tips: [
                          "Ensure the image URL is publicly accessible",
                          "Image should be HTTPS (not HTTP)",
                          "Supported formats: JPG, PNG, GIF",
                          "Recommended size: 1200x628 pixels",
                          "File size should be under 8MB",
                        ],
                        permission_tips: [
                          "Ensure you have admin access to the Facebook Page",
                          "Check that the Page is published and active",
                          "Verify Instagram account is connected if using instagram_actor_id",
                        ],
                      },
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      server.tool(
        "check_account_setup",
        "Check if ad account has all required setup for ad set creation",
        {
          account_id: z.string().describe("The ad account ID to check"),
        },
        async ({ account_id }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            // Get detailed account information
            const account = await metaClient.getAdAccount(account_id);

            const setupCheck = {
              account_id,
              account_status: account.account_status,
              currency: account.currency,
              timezone_name: account.timezone_name,
              has_payment_method: false,
              business_info: {},
              required_fixes: [] as string[],
              success_likelihood: "unknown",
            };

            // Check payment methods
            try {
              const fundingSources = await metaClient.getFundingSources(
                account_id
              );
              setupCheck.has_payment_method =
                fundingSources && fundingSources.length > 0;

              // If funding sources check fails, try alternative approach
              if (!setupCheck.has_payment_method) {
                // Check if account has spend activity (indicates payment method exists)
                try {
                  const spend = await metaClient.getInsights(account_id, {
                    level: "account",
                    date_preset: "last_30d",
                    fields: ["spend"],
                    limit: 1,
                  });

                  if (spend && spend.data && spend.data.length > 0) {
                    const spendAmount = parseFloat(spend.data[0].spend || "0");
                    if (spendAmount > 0) {
                      setupCheck.has_payment_method = true;
                      setupCheck.required_fixes.push(
                        "Payment method detected via spend history (funding_source_details API may have limited access)"
                      );
                    }
                  }
                } catch (spendError) {
                  // Ignore spend check errors
                }
              }
            } catch (error) {
              setupCheck.required_fixes.push(
                "Unable to check payment methods - may need account admin access"
              );
            }

            // Check business info
            try {
              const businessInfo = await metaClient.getAccountBusiness(
                account_id
              );
              setupCheck.business_info = businessInfo;
            } catch (error) {
              setupCheck.required_fixes.push(
                "Unable to access business information"
              );
            }

            // Analyze issues
            if (account.account_status !== 1) {
              setupCheck.required_fixes.push(
                `Account status is ${account.account_status}, must be ACTIVE`
              );
            }

            if (!setupCheck.has_payment_method) {
              setupCheck.required_fixes.push(
                "Payment method not detected via API - if you have one set up, try creating the ad set anyway (API detection can be unreliable)"
              );
            }

            // Budget recommendations based on currency
            const budgetRecommendations = {
              USD: "Minimum $1 (100 cents), recommended $10+ (1000+ cents)",
              EUR: "Minimum €1 (100 cents), recommended €10+ (1000+ cents)",
              GBP: "Minimum £1 (100 pence), recommended £10+ (1000+ pence)",
              INR: "Minimum ₹84 (8400 paisa), recommended ₹500+ (50000+ paisa)",
              default: `Minimum 100 ${account.currency} cents, recommended 1000+ ${account.currency} cents`,
            };

            setupCheck.currency =
              budgetRecommendations[account.currency] ||
              budgetRecommendations.default;

            // Success likelihood
            if (setupCheck.required_fixes.length === 0) {
              setupCheck.success_likelihood = "high";
            } else if (setupCheck.required_fixes.length <= 2) {
              setupCheck.success_likelihood = "medium";
            } else {
              setupCheck.success_likelihood = "low";
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      setup_check: setupCheck,
                      next_steps:
                        setupCheck.required_fixes.length > 0
                          ? "Fix the issues listed above, then try ad set creation again"
                          : "Account appears ready for ad set creation",
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: false,
                      error: error.message,
                      account_id,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      // Diagnostic Tools
      server.tool(
        "diagnose_campaign_readiness",
        "Check if a campaign is ready for ad set creation and identify potential issues",
        {
          campaign_id: z.string().describe("The campaign ID to diagnose"),
        },
        async ({ campaign_id }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            // Get campaign details
            const campaign = await metaClient.getCampaign(campaign_id);

            // Get account details
            const accountId = campaign.account_id;
            const account = await metaClient.getAdAccount(accountId);

            // Check for common issues
            const diagnostics = {
              campaign_status: campaign.status,
              campaign_objective: campaign.objective,
              account_status: account.account_status,
              account_currency: account.currency,
              has_payment_method: account.funding_source_details?.length > 0,
              pixel_setup: "Unknown - check manually in Ads Manager",
              recommendations: [] as string[],
            };

            // Add recommendations based on findings
            if (campaign.status !== "ACTIVE" && campaign.status !== "PAUSED") {
              diagnostics.recommendations.push(
                "Campaign status should be ACTIVE or PAUSED for ad set creation"
              );
            }

            if (
              campaign.objective === "OUTCOME_SALES" ||
              campaign.objective === "CONVERSIONS"
            ) {
              diagnostics.recommendations.push(
                "Sales/conversion campaigns may require Facebook Pixel setup"
              );
              diagnostics.recommendations.push(
                "Consider using OFFSITE_CONVERSIONS optimization goal"
              );
            }

            if (account.account_status !== 1) {
              diagnostics.recommendations.push(
                "Account must be in ACTIVE status for ad creation"
              );
            }

            if (!diagnostics.has_payment_method) {
              diagnostics.recommendations.push(
                "Add a payment method to the ad account"
              );
            }

            diagnostics.recommendations.push(
              "Wait 1-2 minutes after campaign creation before adding ad sets"
            );
            diagnostics.recommendations.push(
              "Start with simple targeting (just countries and age)"
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      campaign_id,
                      diagnostics,
                      suggested_ad_set_config: {
                        optimization_goal:
                          campaign.objective === "OUTCOME_SALES"
                            ? "OFFSITE_CONVERSIONS"
                            : "LINK_CLICKS",
                        billing_event: "LINK_CLICKS",
                        daily_budget: 500, // $5 minimum
                        targeting: {
                          geo_locations: { countries: ["US"] },
                          age_min: 25,
                          age_max: 65,
                        },
                      },
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: false,
                      error: error.message,
                      campaign_id,
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      // v23.0 Image Upload from URL Tool
      server.tool(
        "upload_image_from_url",
        "Upload an image from a URL to Meta and get the image_hash for v23.0 API compliance. Downloads the image from the provided URL and uploads it to Meta's servers, returning the hash required for ad creatives.",
        {
          account_id: z
            .string()
            .describe("Meta Ad Account ID (with act_ prefix)"),
          image_url: z
            .string()
            .url()
            .describe("URL of the image to download and upload"),
          image_name: z
            .string()
            .optional()
            .describe("Optional custom name for the uploaded image"),
        },
        async ({ account_id, image_url, image_name }) => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            // Validate account ID format
            if (!account_id.startsWith("act_")) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Error: Account ID must include "act_" prefix. Use "act_${account_id}" instead.`,
                  },
                ],
                isError: true,
              };
            }

            const metaClient = new MetaApiClient(auth);
            await auth.refreshTokenIfNeeded();

            // Use the MetaApiClient to upload the image
            const uploadResult = await metaClient.uploadImageFromUrl(
              account_id,
              image_url,
              image_name
            );

            const response = {
              success: true,
              message: "Image uploaded successfully to Meta",
              api_version: "v23.0",
              upload_details: {
                account_id,
                original_url: image_url,
                uploaded_name: uploadResult.name,
                image_hash: uploadResult.hash,
                meta_url: uploadResult.url,
              },
              usage_examples: {
                single_image_ads: {
                  description: "Use the returned hash in create_ad_creative",
                  example: {
                    account_id: account_id,
                    name: "My Creative",
                    page_id: "YOUR_PAGE_ID",
                    image_hash: uploadResult.hash,
                    message: "Your ad text",
                    headline: "Your headline",
                    link_url: "https://your-website.com",
                    call_to_action_type: "SHOP_NOW",
                  },
                },
              },
              next_steps: [
                `Use the image_hash "${uploadResult.hash}" in create_ad_creative`,
                "The image is now stored in your Meta ad account library",
                "Create your ad creative using the hash instead of external URL",
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
            return {
              content: [
                {
                  type: "text",
                  text: `Error uploading image from URL: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      // v23.0 API Compliance Checker
      server.tool(
        "check_api_v23_compliance",
        "Check if your creative parameters are compliant with Meta Marketing API v23.0 requirements. Identifies deprecated features and recommends v23.0 best practices.",
        {
          account_id: z.string().describe("Meta Ad Account ID"),
          name: z.string().describe("Creative name"),
          page_id: z.string().describe("Facebook Page ID"),
          message: z.string().describe("Primary ad text/message"),
          call_to_action_type: z
            .string()
            .optional()
            .describe("Call-to-action type"),
          picture: z.string().optional().describe("External image URL"),
          image_hash: z.string().optional().describe("Pre-uploaded image hash"),
        },
        async (params) => {
          try {
            const complianceCheck = {
              api_version: "v23.0",
              check_date: new Date().toISOString(),
              overall_compliance: "checking",
              critical_issues: [] as string[],
              warnings: [] as string[],
              recommendations: [] as string[],
              v23_features: {
                account_format: { status: "unknown", details: "" },
                image_handling: { status: "unknown", details: "" },
                cta_compliance: { status: "unknown", details: "" },
              },
            };

            // Check account ID format
            if (!params.account_id.startsWith("act_")) {
              complianceCheck.critical_issues.push(
                "Account ID missing 'act_' prefix - will cause Error Code 100, Subcode 33"
              );
              complianceCheck.v23_features.account_format.status = "error";
              complianceCheck.v23_features.account_format.details =
                "Must use 'act_XXXXXXXXX' format";
            } else {
              complianceCheck.v23_features.account_format.status = "compliant";
              complianceCheck.v23_features.account_format.details =
                "Correct account ID format";
            }

            // Check image handling
            if (params.picture && params.image_hash) {
              complianceCheck.critical_issues.push(
                "Cannot use both picture (external URL) and image_hash simultaneously"
              );
            } else if (params.image_hash) {
              complianceCheck.v23_features.image_handling.status = "optimal";
              complianceCheck.v23_features.image_handling.details =
                "Using recommended image_hash method";
            } else if (params.picture) {
              complianceCheck.v23_features.image_handling.status = "acceptable";
              complianceCheck.v23_features.image_handling.details =
                "Using external URL (consider uploading for better performance)";
              complianceCheck.recommendations.push(
                "Consider using upload_image_from_url for better performance"
              );
            }

            // Check CTA compliance
            if (params.call_to_action_type) {
              const v23CTATypes = [
                "LEARN_MORE",
                "SHOP_NOW",
                "SIGN_UP",
                "DOWNLOAD",
                "BOOK_TRAVEL",
                "LISTEN_MUSIC",
                "WATCH_VIDEO",
                "GET_QUOTE",
                "CONTACT_US",
                "APPLY_NOW",
                "GET_DIRECTIONS",
                "CALL_NOW",
                "MESSAGE_PAGE",
                "SUBSCRIBE",
                "BOOK_NOW",
              ];

              if (v23CTATypes.includes(params.call_to_action_type)) {
                complianceCheck.v23_features.cta_compliance.status =
                  "compliant";
                complianceCheck.v23_features.cta_compliance.details =
                  "Using supported v23.0 CTA type";
              } else {
                complianceCheck.warnings.push(
                  `CTA type '${params.call_to_action_type}' may not be supported in v23.0`
                );
              }
            }

            // Overall compliance assessment
            complianceCheck.overall_compliance =
              complianceCheck.critical_issues.length > 0
                ? "non_compliant"
                : "compliant";

            // Add general recommendations
            complianceCheck.recommendations.push(
              "Test creatives in small budgets before scaling"
            );
            complianceCheck.recommendations.push(
              "Monitor Meta's API changelog for quarterly updates"
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(complianceCheck, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error checking v23.0 compliance: ${error.message}`,
                },
              ],
              isError: true,
            };
          }
        }
      );

      // OAuth Tools
      server.tool(
        "get_token_info",
        "Get information about the current access token",
        {},
        async () => {
          try {
            if (!authHeader) throw new Error("Authentication required");
            const user = await UserAuthManager.authenticateUser(authHeader);
            if (!user) throw new Error("Invalid authentication token");
            const auth = await UserAuthManager.createUserAuthManager(
              user.userId
            );
            if (!auth)
              throw new Error("Failed to initialize user authentication");

            const tokenInfo = await auth.getTokenInfo();

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: true, token_info: tokenInfo },
                    null,
                    2
                  ),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    { success: false, error: error.message },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }
        }
      );

      console.log("✅ MCP server initialized with tools");
    },
    {
      // Server options
    },
    {
      // Vercel adapter configuration
      basePath: "/api",
      maxDuration: 60,
      verboseLogs: true,
    }
  )(req);
};

export { handler as GET, handler as POST };

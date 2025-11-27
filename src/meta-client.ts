import fetch from "node-fetch";
import { AuthManager } from "./utils/auth.js";
import { globalRateLimiter } from "./utils/rate-limiter.js";
import {
  MetaApiErrorHandler,
  retryWithBackoff,
} from "./utils/error-handler.js";
import {
  PaginationHelper,
  type PaginationParams,
  type PaginatedResult,
} from "./utils/pagination.js";
import type {
  Campaign,
  AdSet,
  Ad,
  AdCreative,
  AdInsights,
  CustomAudience,
  AdAccount,
  MetaApiResponse,
  BatchRequest,
  BatchResponse,
} from "./types/meta-api.js";

export class MetaApiClient {
  private auth: AuthManager;

  constructor(auth?: AuthManager) {
    this.auth = auth || AuthManager.fromEnvironment();
  }

  get authManager(): AuthManager {
    return this.auth;
  }

  private async makeRequest<T>(
    endpoint: string,
    method: "GET" | "POST" | "DELETE" = "GET",
    body?: any,
    accountId?: string,
    isWriteCall: boolean = false
  ): Promise<T> {
    const url = `${this.auth.getBaseUrl()}/${this.auth.getApiVersion()}/${endpoint}`;

    // Check rate limit if we have an account ID
    if (accountId) {
      await globalRateLimiter.checkRateLimit(accountId, isWriteCall);
    }

    return retryWithBackoff(async () => {
      const headers = this.auth.getAuthHeaders();

      const requestOptions: any = {
        method,
        headers,
      };

      if (body && method !== "GET") {
        if (typeof body === "string") {
          requestOptions.body = body;
          headers["Content-Type"] = "application/x-www-form-urlencoded";
        } else {
          requestOptions.body = JSON.stringify(body);
          headers["Content-Type"] = "application/json";
        }
      }

      const response = await fetch(url, requestOptions);
      return MetaApiErrorHandler.handleResponse(response as any);
    }, `${method} ${endpoint}`);
  }

  private buildQueryString(params: Record<string, any>): string {
    const urlParams = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          urlParams.set(key, JSON.stringify(value));
        } else if (typeof value === "object") {
          urlParams.set(key, JSON.stringify(value));
        } else {
          urlParams.set(key, String(value));
        }
      }
    }

    return urlParams.toString();
  }

  // Account Methods
  async getAdAccounts(): Promise<AdAccount[]> {
    const allAccounts: AdAccount[] = [];
    let nextUrl: string | undefined = "me/adaccounts?fields=id,name,account_status,balance,currency,timezone_name,business&limit=100";
    
    // Fetch all pages of accounts
    while (nextUrl) {
      const response: MetaApiResponse<AdAccount> = await this.makeRequest<MetaApiResponse<AdAccount>>(
        nextUrl
      );
      
      allAccounts.push(...response.data);
      
      // Check if there's a next page
      if (response.paging?.next) {
        // Extract the relative path from the full URL
        const nextPageUrl = new URL(response.paging.next);
        nextUrl = nextPageUrl.pathname.substring(1) + nextPageUrl.search; // Remove leading '/'
      } else {
        nextUrl = undefined;
      }
    }
    
    return allAccounts;
  }

  // Campaign Methods
  async getCampaigns(
    accountId: string,
    params: PaginationParams & { status?: string[]; fields?: string[] } = {}
  ): Promise<PaginatedResult<Campaign>> {
    const formattedAccountId = this.auth.getAccountId(accountId);
    const { status, fields, ...paginationParams } = params;

    const queryParams: Record<string, any> = {
      fields:
        fields?.join(",") ||
        "id,name,objective,status,effective_status,created_time,updated_time,start_time,stop_time,budget_remaining,daily_budget,lifetime_budget",
      ...paginationParams,
    };

    if (status) {
      queryParams.effective_status = JSON.stringify([status]);
    }

    const query = this.buildQueryString(queryParams);
    const response = await this.makeRequest<MetaApiResponse<Campaign>>(
      `${formattedAccountId}/campaigns?${query}`,
      "GET",
      null,
      formattedAccountId
    );

    return PaginationHelper.parsePaginatedResponse(response);
  }

  async getCampaign(campaignId: string): Promise<Campaign> {
    return this.makeRequest<Campaign>(
      `${campaignId}?fields=id,name,objective,status,effective_status,created_time,updated_time,start_time,stop_time,budget_remaining,daily_budget,lifetime_budget,account_id`
    );
  }

  async createCampaign(
    accountId: string,
    campaignData: {
      name: string;
      objective: string;
      status?: string;
      daily_budget?: number;
      lifetime_budget?: number;
      start_time?: string;
      stop_time?: string;
      special_ad_categories?: string[];
      bid_strategy?: string;
      bid_cap?: number;
      is_budget_optimization_enabled?: boolean;
    }
  ): Promise<{ id: string }> {
    const formattedAccountId = this.auth.getAccountId(accountId);
    const body = this.buildQueryString(campaignData);

    return this.makeRequest<{ id: string }>(
      `${formattedAccountId}/campaigns`,
      "POST",
      body,
      formattedAccountId,
      true
    );
  }

  async updateCampaign(
    campaignId: string,
    updates: {
      name?: string;
      status?: string;
      daily_budget?: number;
      lifetime_budget?: number;
      start_time?: string;
      stop_time?: string;
    }
  ): Promise<{ success: boolean }> {
    const body = this.buildQueryString(updates);

    return this.makeRequest<{ success: boolean }>(
      campaignId,
      "POST",
      body,
      undefined,
      true
    );
  }

  async deleteCampaign(campaignId: string): Promise<{ success: boolean }> {
    return this.makeRequest<{ success: boolean }>(
      campaignId,
      "DELETE",
      null,
      undefined,
      true
    );
  }

  // Ad Set Methods
  async getAdSets(
    params: PaginationParams & {
      campaignId?: string;
      accountId?: string;
      status?: string;
      fields?: string[];
    } = {}
  ): Promise<PaginatedResult<AdSet>> {
    const { campaignId, accountId, status, fields, ...paginationParams } =
      params;

    let endpoint: string;
    if (campaignId) {
      endpoint = `${campaignId}/adsets`;
    } else if (accountId) {
      const formattedAccountId = this.auth.getAccountId(accountId);
      endpoint = `${formattedAccountId}/adsets`;
    } else {
      throw new Error("Either campaignId or accountId must be provided");
    }

    const queryParams: Record<string, any> = {
      fields:
        fields?.join(",") ||
        "id,name,campaign_id,status,effective_status,created_time,updated_time,start_time,end_time,daily_budget,lifetime_budget,bid_amount,billing_event,optimization_goal",
      ...paginationParams,
    };

    if (status) {
      queryParams.effective_status = JSON.stringify([status]);
    }

    const query = this.buildQueryString(queryParams);
    const response = await this.makeRequest<MetaApiResponse<AdSet>>(
      `${endpoint}?${query}`,
      "GET",
      null,
      accountId ? this.auth.getAccountId(accountId) : undefined
    );

    return PaginationHelper.parsePaginatedResponse(response);
  }

  async createAdSet(
    campaignId: string,
    adSetData: {
      name: string;
      daily_budget?: number;
      lifetime_budget?: number;
      optimization_goal: string;
      billing_event: string;
      bid_amount?: number;
      start_time?: string;
      end_time?: string;
      targeting?: any;
      status?: string;
      promoted_object?: {
        page_id?: string;
        pixel_id?: string;
        application_id?: string;
        object_store_url?: string;
        custom_event_type?: string;
      };
      attribution_spec?: Array<{
        event_type: string;
        window_days: number;
      }>;
      destination_type?: string;
      is_dynamic_creative?: boolean;
      use_new_app_click?: boolean;
      configured_status?: string;
      optimization_sub_event?: string;
      recurring_budget_semantics?: boolean;
    }
  ): Promise<{ id: string }> {
    // First, get the campaign to find its account_id
    const campaign = await this.getCampaign(campaignId);
    const accountId = campaign.account_id;

    if (!accountId) {
      throw new Error("Unable to determine account ID from campaign");
    }

    const formattedAccountId = this.auth.getAccountId(accountId);

    // Ensure campaign_id is included in the request body
    const requestData = {
      ...adSetData,
      campaign_id: campaignId,
    };

    const body = this.buildQueryString(requestData);

    // Enhanced debugging for ad set creation
    console.log("=== AD SET CREATION DEBUG ===");
    console.log("Campaign ID:", campaignId);
    console.log("Account ID:", accountId);
    console.log("Formatted Account ID:", formattedAccountId);
    console.log("Request Data Object:", JSON.stringify(requestData, null, 2));
    console.log("Request Body (URL-encoded):", body);
    console.log("API Endpoint:", `${formattedAccountId}/adsets`);
    console.log("===========================");

    try {
      const result = await this.makeRequest<{ id: string }>(
        `${formattedAccountId}/adsets`,
        "POST",
        body,
        formattedAccountId,
        true
      );

      console.log("=== AD SET CREATION SUCCESS ===");
      console.log("Created Ad Set ID:", result.id);
      console.log("==============================");

      return result;
    } catch (error) {
      console.log("=== AD SET CREATION ERROR ===");
      console.log("Error object:", error);

      if (error instanceof Error) {
        console.log("Error message:", error.message);

        // Try to parse error response if it's JSON
        try {
          const errorData = JSON.parse(error.message);
          console.log("Parsed error data:", JSON.stringify(errorData, null, 2));

          if (errorData.error) {
            console.log("Meta API Error Details:");
            console.log("- Message:", errorData.error.message);
            console.log("- Code:", errorData.error.code);
            console.log("- Type:", errorData.error.type);
            console.log("- Error Subcode:", errorData.error.error_subcode);
            console.log("- FBTrace ID:", errorData.error.fbtrace_id);

            if (errorData.error.error_data) {
              console.log(
                "- Error Data:",
                JSON.stringify(errorData.error.error_data, null, 2)
              );
            }

            if (errorData.error.error_user_title) {
              console.log("- User Title:", errorData.error.error_user_title);
            }

            if (errorData.error.error_user_msg) {
              console.log("- User Message:", errorData.error.error_user_msg);
            }
          }
        } catch (parseError) {
          console.log(
            "Could not parse error as JSON, raw message:",
            error.message
          );
        }
      }
      console.log("============================");

      throw error;
    }
  }

  // Insights Methods
  async getInsights(
    objectId: string,
    params: {
      level?: "account" | "campaign" | "adset" | "ad";
      date_preset?: string;
      time_range?: { since: string; until: string };
      time_increment?: number;
      fields?: string[];
      breakdowns?: string[];
      limit?: number;
      after?: string;
    } = {}
  ): Promise<PaginatedResult<AdInsights>> {
    const queryParams: Record<string, any> = {
      fields:
        params.fields?.join(",") ||
        "impressions,clicks,spend,reach,frequency,ctr,cpc,cpm,actions,cost_per_action_type",
      ...params,
    };

    if (params.time_range) {
      queryParams.time_range = params.time_range;
    }

    const query = this.buildQueryString(queryParams);
    const response = await this.makeRequest<MetaApiResponse<AdInsights>>(
      `${objectId}/insights?${query}`
    );

    return PaginationHelper.parsePaginatedResponse(response);
  }

  // Custom Audience Methods
  async getCustomAudiences(
    accountId: string,
    params: PaginationParams & { fields?: string[] } = {}
  ): Promise<PaginatedResult<CustomAudience>> {
    const formattedAccountId = this.auth.getAccountId(accountId);
    const { fields, ...paginationParams } = params;

    const queryParams: Record<string, any> = {
      fields:
        fields?.join(",") ||
        "id,name,description,subtype,approximate_count,data_source,retention_days,creation_time,operation_status",
      ...paginationParams,
    };

    const query = this.buildQueryString(queryParams);
    const response = await this.makeRequest<MetaApiResponse<CustomAudience>>(
      `${formattedAccountId}/customaudiences?${query}`,
      "GET",
      null,
      formattedAccountId
    );

    return PaginationHelper.parsePaginatedResponse(response);
  }

  async createCustomAudience(
    accountId: string,
    audienceData: {
      name: string;
      description?: string;
      subtype: string;
      customer_file_source?: string;
      retention_days?: number;
      rule?: any;
    }
  ): Promise<{ id: string }> {
    const formattedAccountId = this.auth.getAccountId(accountId);
    const body = this.buildQueryString(audienceData);

    return this.makeRequest<{ id: string }>(
      `${formattedAccountId}/customaudiences`,
      "POST",
      body,
      formattedAccountId,
      true
    );
  }

  async createLookalikeAudience(
    accountId: string,
    audienceData: {
      name: string;
      origin_audience_id: string;
      country: string;
      ratio: number;
      description?: string;
    }
  ): Promise<{ id: string }> {
    const formattedAccountId = this.auth.getAccountId(accountId);
    const body = this.buildQueryString({
      ...audienceData,
      subtype: "LOOKALIKE",
      lookalike_spec: {
        ratio: audienceData.ratio,
        country: audienceData.country,
        type: "similarity",
      },
    });

    return this.makeRequest<{ id: string }>(
      `${formattedAccountId}/customaudiences`,
      "POST",
      body,
      formattedAccountId,
      true
    );
  }

  // Creative Methods
  async getAdCreatives(
    accountId: string,
    params: PaginationParams & { fields?: string[] } = {}
  ): Promise<PaginatedResult<AdCreative>> {
    const formattedAccountId = this.auth.getAccountId(accountId);
    const { fields, ...paginationParams } = params;

    const queryParams: Record<string, any> = {
      fields:
        fields?.join(",") ||
        "id,name,title,body,image_url,video_id,call_to_action,object_story_spec",
      ...paginationParams,
    };

    const query = this.buildQueryString(queryParams);
    const response = await this.makeRequest<MetaApiResponse<AdCreative>>(
      `${formattedAccountId}/adcreatives?${query}`,
      "GET",
      null,
      formattedAccountId
    );

    return PaginationHelper.parsePaginatedResponse(response);
  }

  async createAdCreative(
    accountId: string,
    creativeData: {
      name: string;
      object_story_spec: any;
      degrees_of_freedom_spec?: any;
    }
  ): Promise<AdCreative> {
    const formattedAccountId = this.auth.getAccountId(accountId);
    const body = this.buildQueryString(creativeData);

    return this.makeRequest<AdCreative>(
      `${formattedAccountId}/adcreatives`,
      "POST",
      body,
      formattedAccountId,
      true
    );
  }

  // Ad Management
  async createAd(
    adSetId: string,
    adData: {
      name: string;
      adset_id: string;
      creative: { creative_id: string };
      status?: string;
    }
  ): Promise<Ad> {
    console.log("=== CREATE AD DEBUG ===");
    console.log("Ad Set ID:", adSetId);
    console.log("Ad Data:", JSON.stringify(adData, null, 2));

    const body = this.buildQueryString(adData);
    console.log("Request body:", body);
    console.log("API endpoint:", `${adSetId}/ads`);

    try {
      const result = await this.makeRequest<Ad>(
        `${adSetId}/ads`,
        "POST",
        body,
        undefined, // Don't pass account ID for rate limiting since we don't have it
        true
      );

      console.log("Create ad success:", JSON.stringify(result, null, 2));
      console.log("=====================");
      return result;
    } catch (error) {
      console.log("=== CREATE AD ERROR ===");
      console.log("Error object:", error);

      if (error instanceof Error) {
        console.log("Error message:", error.message);

        // Try to parse Meta API error response
        try {
          const errorData = JSON.parse(error.message);
          console.log(
            "Parsed Meta API error:",
            JSON.stringify(errorData, null, 2)
          );

          if (errorData.error) {
            console.log("Meta API Error Details:");
            console.log("- Message:", errorData.error.message);
            console.log("- Code:", errorData.error.code);
            console.log("- Type:", errorData.error.type);
            console.log("- Error Subcode:", errorData.error.error_subcode);
            console.log("- FBTrace ID:", errorData.error.fbtrace_id);
          }
        } catch (parseError) {
          console.log(
            "Could not parse error as JSON, raw message:",
            error.message
          );
        }
      }
      console.log("=====================");
      throw error;
    }
  }

  // Ad Methods
  async getAds(
    params: PaginationParams & {
      adsetId?: string;
      campaignId?: string;
      accountId?: string;
      status?: string;
      fields?: string[];
    } = {}
  ): Promise<PaginatedResult<Ad>> {
    const {
      adsetId,
      campaignId,
      accountId,
      status,
      fields,
      ...paginationParams
    } = params;

    let endpoint: string;
    if (adsetId) {
      endpoint = `${adsetId}/ads`;
    } else if (campaignId) {
      endpoint = `${campaignId}/ads`;
    } else if (accountId) {
      const formattedAccountId = this.auth.getAccountId(accountId);
      endpoint = `${formattedAccountId}/ads`;
    } else {
      throw new Error(
        "Either adsetId, campaignId, or accountId must be provided"
      );
    }

    const queryParams: Record<string, any> = {
      fields:
        fields?.join(",") ||
        "id,name,adset_id,campaign_id,status,effective_status,created_time,updated_time,creative",
      ...paginationParams,
    };

    if (status) {
      queryParams.effective_status = JSON.stringify([status]);
    }

    const query = this.buildQueryString(queryParams);
    const response = await this.makeRequest<MetaApiResponse<Ad>>(
      `${endpoint}?${query}`,
      "GET",
      null,
      accountId ? this.auth.getAccountId(accountId) : undefined
    );

    return PaginationHelper.parsePaginatedResponse(response);
  }

  async getAdsByCampaign(
    campaignId: string,
    params: PaginationParams & { status?: string[] } = {}
  ): Promise<PaginatedResult<Ad>> {
    const queryParams: Record<string, any> = {
      fields: "id,name,status,effective_status,created_time,adset_id,creative",
      limit: params.limit || 25,
      after: params.after,
      before: params.before,
    };

    if (params.status) {
      queryParams.status = JSON.stringify(params.status);
    }

    const query = this.buildQueryString(queryParams);
    const result = await this.makeRequest<MetaApiResponse<Ad>>(
      `${campaignId}/ads?${query}`,
      "GET",
      undefined,
      undefined
    );

    return PaginationHelper.parsePaginatedResponse(result);
  }

  async getAdsByAccount(
    accountId: string,
    params: PaginationParams & { status?: string[] } = {}
  ): Promise<PaginatedResult<Ad>> {
    const formattedAccountId = this.auth.getAccountId(accountId);
    const queryParams: Record<string, any> = {
      fields: "id,name,status,effective_status,created_time,adset_id,creative",
      limit: params.limit || 25,
      after: params.after,
      before: params.before,
    };

    if (params.status) {
      queryParams.status = JSON.stringify(params.status);
    }

    const query = this.buildQueryString(queryParams);
    const result = await this.makeRequest<MetaApiResponse<Ad>>(
      `${formattedAccountId}/ads?${query}`,
      "GET",
      undefined,
      formattedAccountId
    );

    return PaginationHelper.parsePaginatedResponse(result);
  }

  // Account and Business Methods
  async getAdAccount(accountId: string): Promise<AdAccount> {
    const formattedAccountId = this.auth.getAccountId(accountId);
    const queryParams = {
      fields:
        "id,name,account_status,currency,timezone_name,funding_source_details,business",
    };

    const query = this.buildQueryString(queryParams);
    return this.makeRequest<AdAccount>(
      `${formattedAccountId}?${query}`,
      "GET",
      undefined,
      formattedAccountId
    );
  }

  async getFundingSources(accountId: string): Promise<any[]> {
    const formattedAccountId = this.auth.getAccountId(accountId);

    try {
      const result = await this.makeRequest<MetaApiResponse<any>>(
        `${formattedAccountId}/funding_source_details`,
        "GET",
        undefined,
        formattedAccountId
      );
      return result.data || [];
    } catch (error) {
      // Return empty array if no permission to access funding sources
      return [];
    }
  }

  async getAccountBusiness(accountId: string): Promise<any> {
    const formattedAccountId = this.auth.getAccountId(accountId);

    try {
      return await this.makeRequest<any>(
        `${formattedAccountId}/business`,
        "GET",
        undefined,
        formattedAccountId
      );
    } catch (error) {
      // Return empty object if no business info available
      return {};
    }
  }

  async getCustomAudience(audienceId: string): Promise<CustomAudience> {
    const queryParams = {
      fields:
        "id,name,description,approximate_count,delivery_status,operation_status",
    };

    const query = this.buildQueryString(queryParams);
    return this.makeRequest<CustomAudience>(`${audienceId}?${query}`, "GET");
  }

  // Batch Operations
  async batchRequest(requests: BatchRequest[]): Promise<BatchResponse[]> {
    const body = this.buildQueryString({
      batch: JSON.stringify(requests),
    });

    return this.makeRequest<BatchResponse[]>("", "POST", body, undefined, true);
  }

  // Utility Methods
  async estimateAudienceSize(
    accountId: string,
    targeting: any,
    optimizationGoal: string
  ): Promise<{ estimate_mau: number; estimate_dau?: number }> {
    const formattedAccountId = this.auth.getAccountId(accountId);
    const queryParams = {
      targeting_spec: targeting,
      optimization_goal: optimizationGoal,
    };

    const query = this.buildQueryString(queryParams);
    return this.makeRequest<{ estimate_mau: number; estimate_dau?: number }>(
      `${formattedAccountId}/delivery_estimate?${query}`,
      "GET",
      null,
      formattedAccountId
    );
  }

  async generateAdPreview(
    creativeId: string,
    adFormat: string,
    productItemIds?: string[]
  ): Promise<{ body: string }> {
    const queryParams: Record<string, any> = {
      ad_format: adFormat,
    };

    if (productItemIds && productItemIds.length > 0) {
      queryParams.product_item_ids = productItemIds;
    }

    const query = this.buildQueryString(queryParams);
    return this.makeRequest<{ body: string }>(
      `${creativeId}/previews?${query}`
    );
  }

  // Helper method to get account ID for rate limiting
  extractAccountIdFromObjectId(objectId: string): string | undefined {
    // Try to extract account ID from campaign/adset/ad ID patterns
    const campaign = objectId.match(/^(\d+)$/);
    if (campaign) {
      // For direct campaign/adset/ad IDs, we can't determine the account
      // This would need to be provided by the caller or cached
      return undefined;
    }

    // If it's already a formatted account ID
    if (objectId.startsWith("act_")) {
      return objectId;
    }

    return undefined;
  }

  // Image Upload for v23.0 compliance
  async uploadImageFromUrl(
    accountId: string,
    imageUrl: string,
    imageName?: string
  ): Promise<{ hash: string; url: string; name: string }> {
    try {
      const formattedAccountId = this.auth.getAccountId(accountId);

      console.log("=== IMAGE UPLOAD FROM URL DEBUG ===");
      console.log("Account ID:", formattedAccountId);
      console.log("Image URL:", imageUrl);
      console.log("Image Name:", imageName);

      // Download the image from the URL
      console.log("Downloading image from URL...");
      const imageResponse = await fetch(imageUrl);

      if (!imageResponse.ok) {
        throw new Error(
          `Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`
        );
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const imageBlob = new Blob([imageBuffer], {
        type: imageResponse.headers.get("content-type") || "image/jpeg",
      });

      console.log("Image downloaded, size:", imageBuffer.byteLength, "bytes");
      console.log("Content type:", imageResponse.headers.get("content-type"));

      // Generate filename if not provided
      const filename = imageName || `uploaded_image_${Date.now()}.jpg`;

      // Create FormData for upload
      const formData = new FormData();
      formData.append("filename", imageBlob, filename);
      formData.append("access_token", this.auth.getAccessToken());

      console.log("Uploading to Meta API...");
      console.log(
        "Endpoint:",
        `https://graph.facebook.com/v22.0/${formattedAccountId}/adimages`
      );

      // Upload to Meta API
      const uploadResponse = await fetch(
        `https://graph.facebook.com/v23.0/${formattedAccountId}/adimages`,
        {
          method: "POST",
          body: formData,
        }
      );

      const uploadResult = (await uploadResponse.json()) as any;
      console.log("Upload response:", JSON.stringify(uploadResult, null, 2));

      if (!uploadResponse.ok) {
        console.log("Upload failed with status:", uploadResponse.status);
        throw new Error(`Image upload failed: ${JSON.stringify(uploadResult)}`);
      }

      // Extract image hash from response
      const images = uploadResult.images;
      if (!images || Object.keys(images).length === 0) {
        throw new Error("No image hash returned from Meta API");
      }

      // Get the first (and usually only) image result
      const imageKey = Object.keys(images)[0];
      const imageResult = images[imageKey];

      if (!imageResult.hash) {
        throw new Error("No hash found in image upload response");
      }

      console.log("Image uploaded successfully!");
      console.log("Image hash:", imageResult.hash);
      console.log("Image URL:", imageResult.url);
      console.log("===================================");

      return {
        hash: imageResult.hash,
        url: imageResult.url || imageUrl,
        name: filename,
      };
    } catch (error) {
      console.log("=== IMAGE UPLOAD ERROR ===");
      console.log("Error:", error);
      console.log("=========================");
      throw error;
    }
  }
}

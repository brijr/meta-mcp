import type { MetaApiConfig } from "../types/meta-api.js";

export class AuthManager {
  private config: MetaApiConfig;

  constructor(config: MetaApiConfig) {
    this.config = config;
    this.validateConfig();
  }

  private validateConfig(): void {
    if (!this.config.accessToken) {
      throw new Error(
        "Meta access token is required. Set META_ACCESS_TOKEN environment variable."
      );
    }

    if (this.config.accessToken.length < 10) {
      throw new Error("Invalid Meta access token format.");
    }
  }

  getAccessToken(): string {
    return this.config.accessToken;
  }

  getApiVersion(): string {
    return this.config.apiVersion || "v23.0";
  }

  getBaseUrl(): string {
    return this.config.baseUrl || "https://graph.facebook.com";
  }

  getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.getAccessToken()}`,
      "Content-Type": "application/json",
      "User-Agent": "meta-ads-mcp/1.0.0",
    };
  }

  async validateToken(): Promise<boolean> {
    try {
      console.error("Validating access token using URL:", `${this.getBaseUrl()}/${this.getApiVersion()}/me?access_token=${this.getAccessToken()}`);
      const response = await fetch(
        `${this.getBaseUrl()}/${this.getApiVersion()}/me?access_token=${this.getAccessToken()}`
      );
      return response.ok;
    } catch (error) {
      console.error("Token validation failed:", error);
      return false;
    }
  }

  static fromEnvironment(): AuthManager {
    const config: MetaApiConfig = {
      accessToken: process.env.META_ACCESS_TOKEN || "",
      appId: process.env.META_APP_ID,
      appSecret: process.env.META_APP_SECRET,
      businessId: process.env.META_BUSINESS_ID,
      apiVersion: process.env.META_API_VERSION,
      baseUrl: process.env.META_BASE_URL,
      // OAuth configuration
      redirectUri: process.env.META_REDIRECT_URI,
      refreshToken: process.env.META_REFRESH_TOKEN,
      autoRefresh: process.env.META_AUTO_REFRESH === "true",
    };

    return new AuthManager(config);
  }

  async refreshTokenIfNeeded(): Promise<string> {
    // Try auto-refresh first if enabled
    if (this.config.autoRefresh) {
      try {
        return await this.autoRefreshToken();
      } catch (error) {
        console.warn("Auto-refresh failed, falling back to validation:", error);
      }
    }

    // Fallback to original validation logic
    const isValid = await this.validateToken();
    if (!isValid) {
      throw new Error(
        "Access token is invalid or expired. Please generate a new token or enable auto-refresh."
      );
    }
    return this.config.accessToken;
  }

  getAccountId(accountIdOrNumber: string): string {
    if (accountIdOrNumber.startsWith("act_")) {
      return accountIdOrNumber;
    }
    return `act_${accountIdOrNumber}`;
  }

  extractAccountNumber(accountId: string): string {
    if (accountId.startsWith("act_")) {
      return accountId.substring(4);
    }
    return accountId;
  }

  // OAuth Methods

  /**
   * Generate OAuth authorization URL for user consent
   */
  generateAuthUrl(scopes: string[] = ["ads_management"], state?: string): string {
    if (!this.config.appId || !this.config.redirectUri) {
      throw new Error("App ID and redirect URI are required for OAuth flow");
    }

    const params = new URLSearchParams({
      client_id: this.config.appId,
      redirect_uri: this.config.redirectUri,
      scope: scopes.join(","),
      response_type: "code",
      ...(state && { state }),
    });

    return `https://www.facebook.com/v${this.getApiVersion()}/dialog/oauth?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<{
    accessToken: string;
    tokenType: string;
    expiresIn?: number;
  }> {
    if (!this.config.appId || !this.config.appSecret || !this.config.redirectUri) {
      throw new Error("App ID, app secret, and redirect URI are required for token exchange");
    }

    const params = new URLSearchParams({
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      redirect_uri: this.config.redirectUri,
      code,
    });

    const response = await fetch(
      `${this.getBaseUrl()}/${this.getApiVersion()}/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const data = await response.json();
    
    // Update config with new token
    this.config.accessToken = data.access_token;
    if (data.expires_in) {
      this.config.tokenExpiration = new Date(Date.now() + data.expires_in * 1000);
    }

    return {
      accessToken: data.access_token,
      tokenType: data.token_type || "bearer",
      expiresIn: data.expires_in,
    };
  }

  /**
   * Exchange short-lived token for long-lived token
   */
  async exchangeForLongLivedToken(shortLivedToken?: string): Promise<{
    accessToken: string;
    tokenType: string;
    expiresIn: number;
  }> {
    if (!this.config.appId || !this.config.appSecret) {
      throw new Error("App ID and app secret are required for long-lived token exchange");
    }

    const tokenToExchange = shortLivedToken || this.config.accessToken;
    if (!tokenToExchange) {
      throw new Error("No access token available for exchange");
    }

    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      fb_exchange_token: tokenToExchange,
    });

    const response = await fetch(
      `${this.getBaseUrl()}/${this.getApiVersion()}/oauth/access_token?${params.toString()}`
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Long-lived token exchange failed: ${error}`);
    }

    const data = await response.json();
    
    // Update config with new long-lived token
    this.config.accessToken = data.access_token;
    this.config.tokenExpiration = new Date(Date.now() + data.expires_in * 1000);

    return {
      accessToken: data.access_token,
      tokenType: data.token_type || "bearer",
      expiresIn: data.expires_in,
    };
  }

  /**
   * Check if token is expired or will expire soon
   */
  isTokenExpiring(bufferMinutes: number = 5): boolean {
    if (!this.config.tokenExpiration) {
      return false; // No expiration set, assume it's valid
    }

    const bufferTime = bufferMinutes * 60 * 1000; // Convert to milliseconds
    const expirationWithBuffer = new Date(this.config.tokenExpiration.getTime() - bufferTime);
    
    return new Date() >= expirationWithBuffer;
  }

  /**
   * Automatically refresh token if needed
   */
  async autoRefreshToken(): Promise<string> {
    if (!this.config.autoRefresh) {
      return this.config.accessToken;
    }

    // Check if token is expired or expiring soon
    if (this.isTokenExpiring()) {
      try {
        console.log("Token is expiring, attempting refresh...");
        const result = await this.exchangeForLongLivedToken();
        console.log("Token refreshed successfully");
        return result.accessToken;
      } catch (error) {
        console.error("Auto-refresh failed:", error);
        throw new Error("Token expired and auto-refresh failed. Please re-authenticate.");
      }
    }

    return this.config.accessToken;
  }

  /**
   * Generate system user access token (for server-to-server apps)
   */
  async generateSystemUserToken(
    systemUserId: string,
    scopes: string[] = ["ads_management"],
    expiringToken: boolean = true
  ): Promise<{
    accessToken: string;
    tokenType: string;
    expiresIn?: number;
  }> {
    if (!this.config.appId || !this.config.appSecret) {
      throw new Error("App ID and app secret are required for system user token");
    }

    // Generate app secret proof
    const crypto = await import("crypto");
    const appSecretProof = crypto
      .createHmac("sha256", this.config.appSecret)
      .update(this.config.accessToken)
      .digest("hex");

    const params = new URLSearchParams({
      business_app: this.config.appId,
      scope: scopes.join(","),
      appsecret_proof: appSecretProof,
      access_token: this.config.accessToken,
      ...(expiringToken && { set_token_expires_in_60_days: "true" }),
    });

    const response = await fetch(
      `${this.getBaseUrl()}/${this.getApiVersion()}/${systemUserId}/access_tokens`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`System user token generation failed: ${error}`);
    }

    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      tokenType: "bearer",
      expiresIn: data.expires_in,
    };
  }

  /**
   * Get token info and validation details
   */
  async getTokenInfo(): Promise<{
    appId: string;
    userId?: string;
    scopes: string[];
    expiresAt?: Date;
    isValid: boolean;
  }> {
    try {
      const response = await fetch(
        `${this.getBaseUrl()}/${this.getApiVersion()}/debug_token?input_token=${this.getAccessToken()}&access_token=${this.getAccessToken()}`
      );

      if (!response.ok) {
        throw new Error("Failed to get token info");
      }

      const result = await response.json();
      const data = result.data;

      return {
        appId: data.app_id,
        userId: data.user_id,
        scopes: data.scopes || [],
        expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : undefined,
        isValid: data.is_valid || false,
      };
    } catch (error) {
      console.error("Token info retrieval failed:", error);
      return {
        appId: "",
        scopes: [],
        isValid: false,
      };
    }
  }
}

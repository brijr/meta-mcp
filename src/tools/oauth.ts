import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AuthManager } from "../utils/auth.js";
import {
  GenerateAuthUrlSchema,
  ExchangeCodeSchema,
  RefreshTokenSchema,
  GenerateSystemTokenSchema,
} from "../types/mcp-tools.js";

export function setupOAuthTools(server: McpServer, authManager: AuthManager) {
  registerOAuthTools(server, authManager);
}

export function registerOAuthTools(
  server: McpServer,
  authManager: AuthManager
) {
  // Generate OAuth Authorization URL Tool
  server.tool(
    "generate_auth_url",
    GenerateAuthUrlSchema.shape,
    async ({ scopes, state }) => {
      try {
        const authUrl = authManager.generateAuthUrl(scopes, state);

        const response = {
          success: true,
          authorization_url: authUrl,
          scopes_requested: scopes,
          instructions: [
            "1. Open the authorization URL in a web browser",
            "2. Log in to your Facebook account",
            "3. Grant the requested permissions to your app",
            "4. Copy the authorization code from the redirect URL",
            "5. Use the 'exchange_code_for_token' tool with the authorization code",
          ],
          security_note: state
            ? "State parameter included for CSRF protection"
            : "Consider adding a state parameter for additional security",
          redirect_uri: authManager["config"].redirectUri,
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
              text: `Error generating authorization URL: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Exchange Authorization Code for Token Tool
  server.tool(
    "exchange_code_for_token",
    ExchangeCodeSchema.shape,
    async ({ code }) => {
      try {
        const result = await authManager.exchangeCodeForToken(code);

        const response = {
          success: true,
          message: "Authorization code exchanged successfully",
          token_info: {
            access_token: result.accessToken,
            token_type: result.tokenType,
            expires_in: result.expiresIn,
            expires_at: result.expiresIn
              ? new Date(Date.now() + result.expiresIn * 1000).toISOString()
              : undefined,
          },
          next_steps: [
            "Token is now active and will be used for API calls",
            "Consider exchanging for a long-lived token using 'refresh_to_long_lived_token'",
            "Store the token securely for future use",
          ],
          recommendations: [
            "Long-lived tokens last ~60 days vs ~1-2 hours for short-lived tokens",
            "Enable auto-refresh by setting META_AUTO_REFRESH=true",
            "Monitor token expiration and refresh before it expires",
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
              text: `Error exchanging authorization code: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Refresh to Long-Lived Token Tool
  server.tool(
    "refresh_to_long_lived_token",
    RefreshTokenSchema.shape,
    async ({ short_lived_token }) => {
      try {
        const result = await authManager.exchangeForLongLivedToken(
          short_lived_token
        );

        const response = {
          success: true,
          message: "Token successfully exchanged for long-lived token",
          token_info: {
            access_token: result.accessToken,
            token_type: result.tokenType,
            expires_in: result.expiresIn,
            expires_at: new Date(
              Date.now() + result.expiresIn * 1000
            ).toISOString(),
            lifetime: "Approximately 60 days",
          },
          token_management: {
            auto_refresh_enabled: authManager["config"].autoRefresh || false,
            current_expiration:
              authManager["config"].tokenExpiration?.toISOString(),
            refresh_recommendation:
              "Set up automatic refresh or manually refresh before expiration",
          },
          environment_variables: {
            META_ACCESS_TOKEN: "Update with the new long-lived token",
            META_AUTO_REFRESH: "Set to 'true' to enable automatic refresh",
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
        return {
          content: [
            {
              type: "text",
              text: `Error refreshing to long-lived token: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Generate System User Token Tool
  server.tool(
    "generate_system_user_token",
    GenerateSystemTokenSchema.shape,
    async ({ system_user_id, scopes, expiring_token }) => {
      try {
        const result = await authManager.generateSystemUserToken(
          system_user_id,
          scopes,
          expiring_token
        );

        const response = {
          success: true,
          message: `System user token generated successfully`,
          system_user_id,
          token_info: {
            access_token: result.accessToken,
            token_type: result.tokenType,
            expires_in: result.expiresIn,
            expires_at: result.expiresIn
              ? new Date(Date.now() + result.expiresIn * 1000).toISOString()
              : "Never (non-expiring token)",
            scopes: scopes,
          },
          token_characteristics: {
            type: expiring_token ? "Expiring (60 days)" : "Non-expiring",
            use_case: "Server-to-server automation",
            security_level: "High - requires Business Manager admin access",
          },
          recommendations: [
            "Store the system user token securely",
            "Use for automated, server-side operations",
            "Monitor token usage and permissions",
            expiring_token
              ? "Set up refresh mechanism before 60-day expiration"
              : "Non-expiring tokens require manual revocation if compromised",
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
              text: `Error generating system user token: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Get Token Info Tool
  server.tool("get_token_info", {}, async () => {
    try {
      const tokenInfo = await authManager.getTokenInfo();

      const response = {
        token_info: tokenInfo,
        current_config: {
          has_app_credentials: !!(
            authManager["config"].appId && authManager["config"].appSecret
          ),
          has_redirect_uri: !!authManager["config"].redirectUri,
          auto_refresh_enabled: !!authManager["config"].autoRefresh,
          token_expiration:
            authManager["config"].tokenExpiration?.toISOString(),
        },
        token_status: {
          is_valid: tokenInfo.isValid,
          is_expiring_soon: authManager.isTokenExpiring(60), // 1 hour buffer
          requires_refresh: authManager.isTokenExpiring(5), // 5 minute buffer
        },
        recommendations: generateTokenRecommendations(tokenInfo, authManager),
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
            text: `Error getting token info: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Validate Current Token Tool
  server.tool("validate_token", {}, async () => {
    try {
      const isValid = await authManager.validateToken();
      const tokenInfo = await authManager.getTokenInfo();

      const response = {
        is_valid: isValid,
        validation_timestamp: new Date().toISOString(),
        token_details: tokenInfo,
        health_check: {
          api_connectivity: isValid,
          token_format: !!authManager.getAccessToken(),
          permissions: tokenInfo.scopes || [],
        },
        diagnostics: {
          token_length: authManager.getAccessToken().length,
          expires_at: tokenInfo.expiresAt?.toISOString(),
          user_id: tokenInfo.userId,
          app_id: tokenInfo.appId,
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
      return {
        content: [
          {
            type: "text",
            text: `Error validating token: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });
}

// Helper function to generate token recommendations
function generateTokenRecommendations(
  tokenInfo: any,
  authManager: AuthManager
): string[] {
  const recommendations: string[] = [];

  if (!tokenInfo.isValid) {
    recommendations.push("Token is invalid - obtain a new token immediately");
    recommendations.push("Check app credentials and permissions");
  }

  if (authManager.isTokenExpiring(60)) {
    recommendations.push("Token expires within 1 hour - refresh recommended");
  }

  if (!authManager["config"].autoRefresh) {
    recommendations.push("Enable auto-refresh to prevent token expiration");
    recommendations.push("Set META_AUTO_REFRESH=true in environment variables");
  }

  if (!authManager["config"].appId || !authManager["config"].appSecret) {
    recommendations.push(
      "Configure app credentials for token refresh capabilities"
    );
    recommendations.push(
      "Set META_APP_ID and META_APP_SECRET environment variables"
    );
  }

  if (!tokenInfo.scopes || tokenInfo.scopes.length === 0) {
    recommendations.push("No scopes detected - verify token permissions");
  }

  if (tokenInfo.scopes && !tokenInfo.scopes.includes("ads_management")) {
    recommendations.push(
      "ads_management scope missing - required for Marketing API"
    );
  }

  if (tokenInfo.expiresAt) {
    const daysUntilExpiration = Math.ceil(
      (new Date(tokenInfo.expiresAt).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24)
    );
    if (daysUntilExpiration < 7) {
      recommendations.push(
        `Token expires in ${daysUntilExpiration} days - plan renewal`
      );
    }
  }

  return recommendations;
}

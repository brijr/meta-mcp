import type { ToolExtraArguments } from "xmcp";
import { UnauthorizedError } from "../errors";

export interface AuthContext {
  userId: string;
  workspaceId: string;
  roles: string[];
  token: string;
  scopes: string[];
}

export function getAuthContext(extra: ToolExtraArguments): AuthContext {
  const authInfo = extra.authInfo;
  const authExtra = authInfo?.extra;
  const userId = typeof authExtra?.userId === "string" ? authExtra.userId : null;
  const workspaceId =
    typeof authExtra?.workspaceId === "string" ? authExtra.workspaceId : null;
  const roles = Array.isArray(authExtra?.roles)
    ? authExtra.roles.filter((role): role is string => typeof role === "string")
    : [];

  if (!authInfo?.token || !userId || !workspaceId) {
    throw new UnauthorizedError(
      "Missing authenticated user/workspace context for this MCP request."
    );
  }

  return {
    userId,
    workspaceId,
    roles,
    token: authInfo.token,
    scopes: authInfo.scopes,
  };
}

import type { ToolExtraArguments } from "xmcp";
import { getAuthContext, type AuthContext } from "../auth/context";
import { MetaGraphClient } from "../meta/client";
import { getBindings, type AppBindings } from "../runtime/env";
import {
  requireMetaConnection,
  type MetaConnection,
} from "../storage/connection-repo";
import { toolError, toolSuccess, type ToolResponsePayload } from "../utils/response";

export interface MetaToolContext {
  auth: AuthContext;
  env: AppBindings;
  connection: MetaConnection;
  meta: MetaGraphClient;
}

export function createMetaToolHandler<TArgs>(
  handler: (args: TArgs, context: MetaToolContext) => Promise<ToolResponsePayload>
) {
  return async (args: TArgs, extra: ToolExtraArguments) => {
    try {
      const auth = getAuthContext(extra);
      const env = getBindings();
      const connection = await requireMetaConnection(auth.workspaceId);
      const meta = new MetaGraphClient(connection.accessToken);

      return toolSuccess(
        await handler(args, {
          auth,
          env,
          connection,
          meta,
        })
      );
    } catch (error) {
      return toolError(error);
    }
  };
}

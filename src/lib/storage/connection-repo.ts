import { ConnectionRequiredError } from "../errors";
import { getRequiredBinding } from "../runtime/env";
import { decryptString, encryptString } from "./crypto";

interface MetaConnectionRow {
  workspace_id: string;
  user_id: string;
  access_token_ciphertext: string;
  expires_at: number | null;
  scopes_json: string | null;
  graph_user_id: string | null;
  graph_user_name: string | null;
  last_validated_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetaConnection {
  workspaceId: string;
  userId: string;
  accessToken: string;
  expiresAt: number | null;
  scopes: string[];
  graphUserId: string | null;
  graphUserName: string | null;
  lastValidatedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertMetaConnectionInput {
  workspaceId: string;
  userId: string;
  accessToken: string;
  expiresAt: number | null;
  scopes: string[];
  graphUserId?: string | null;
  graphUserName?: string | null;
  lastError?: string | null;
}

function mapRow(row: MetaConnectionRow, accessToken: string): MetaConnection {
  return {
    workspaceId: row.workspace_id,
    userId: row.user_id,
    accessToken,
    expiresAt: row.expires_at,
    scopes: row.scopes_json ? JSON.parse(row.scopes_json) : [],
    graphUserId: row.graph_user_id,
    graphUserName: row.graph_user_name,
    lastValidatedAt: row.last_validated_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getMetaConnectionByWorkspaceId(
  workspaceId: string
): Promise<MetaConnection | null> {
  const db = getRequiredBinding("META_DB");
  const row = await db
    .prepare(
      `
        SELECT
          workspace_id,
          user_id,
          access_token_ciphertext,
          expires_at,
          scopes_json,
          graph_user_id,
          graph_user_name,
          last_validated_at,
          last_error,
          created_at,
          updated_at
        FROM meta_connections
        WHERE workspace_id = ?
      `
    )
    .bind(workspaceId)
    .first<MetaConnectionRow>();

  if (!row) {
    return null;
  }

  const accessToken = await decryptString(row.access_token_ciphertext);
  return mapRow(row, accessToken);
}

export async function requireMetaConnection(
  workspaceId: string
): Promise<MetaConnection> {
  const connection = await getMetaConnectionByWorkspaceId(workspaceId);
  if (!connection) {
    throw new ConnectionRequiredError();
  }

  return connection;
}

export async function upsertMetaConnection(
  input: UpsertMetaConnectionInput
): Promise<void> {
  const db = getRequiredBinding("META_DB");
  const now = new Date().toISOString();
  const ciphertext = await encryptString(input.accessToken);

  await db
    .prepare(
      `
        INSERT INTO meta_connections (
          workspace_id,
          user_id,
          access_token_ciphertext,
          expires_at,
          scopes_json,
          graph_user_id,
          graph_user_name,
          last_validated_at,
          last_error,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id) DO UPDATE SET
          user_id = excluded.user_id,
          access_token_ciphertext = excluded.access_token_ciphertext,
          expires_at = excluded.expires_at,
          scopes_json = excluded.scopes_json,
          graph_user_id = excluded.graph_user_id,
          graph_user_name = excluded.graph_user_name,
          last_validated_at = excluded.last_validated_at,
          last_error = excluded.last_error,
          updated_at = excluded.updated_at
      `
    )
    .bind(
      input.workspaceId,
      input.userId,
      ciphertext,
      input.expiresAt,
      JSON.stringify(input.scopes),
      input.graphUserId ?? null,
      input.graphUserName ?? null,
      now,
      input.lastError ?? null,
      now,
      now
    )
    .run();
}

export async function markMetaConnectionValidation(
  workspaceId: string,
  lastError: string | null
): Promise<void> {
  const db = getRequiredBinding("META_DB");
  await db
    .prepare(
      `
        UPDATE meta_connections
        SET last_validated_at = ?, last_error = ?, updated_at = ?
        WHERE workspace_id = ?
      `
    )
    .bind(
      new Date().toISOString(),
      lastError,
      new Date().toISOString(),
      workspaceId
    )
    .run();
}

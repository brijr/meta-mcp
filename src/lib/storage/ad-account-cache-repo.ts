import { getRequiredBinding } from "../runtime/env";

interface CachedAdAccountRow {
  account_id: string;
  name: string;
  status: string | null;
  currency: string | null;
  timezone_name: string | null;
  balance_minor: string | null;
  raw_json: string;
}

export interface CachedAdAccount {
  account_id: string;
  name: string;
  status?: string | null;
  currency?: string | null;
  timezone_name?: string | null;
  balance_minor?: string | number | null;
  [key: string]: unknown;
}

export async function replaceCachedAdAccounts(
  workspaceId: string,
  accounts: CachedAdAccount[]
): Promise<void> {
  const db = getRequiredBinding("META_DB");
  await db
    .prepare("DELETE FROM meta_ad_accounts_cache WHERE workspace_id = ?")
    .bind(workspaceId)
    .run();

  for (const account of accounts) {
    await db
      .prepare(
        `
          INSERT INTO meta_ad_accounts_cache (
            workspace_id,
            account_id,
            name,
            status,
            currency,
            timezone_name,
            balance_minor,
            raw_json,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .bind(
        workspaceId,
        account.account_id,
        account.name,
        account.status ?? null,
        account.currency ?? null,
        account.timezone_name ?? null,
        account.balance_minor != null ? String(account.balance_minor) : null,
        JSON.stringify(account),
        new Date().toISOString()
      )
      .run();
  }
}

export async function getCachedAdAccounts(
  workspaceId: string
): Promise<CachedAdAccount[]> {
  const db = getRequiredBinding("META_DB");
  const response = await db
    .prepare(
      `
        SELECT account_id, name, status, currency, timezone_name, balance_minor, raw_json
        FROM meta_ad_accounts_cache
        WHERE workspace_id = ?
        ORDER BY name ASC
      `
    )
    .bind(workspaceId)
    .all<CachedAdAccountRow>();

  return response.results.map((row) => ({
    ...JSON.parse(row.raw_json),
    account_id: row.account_id,
    name: row.name,
  }));
}

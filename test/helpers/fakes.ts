import type {
  AppBindings,
  D1DatabaseLike,
  D1PreparedStatementLike,
  KVNamespaceLike,
} from "../../src/lib/runtime/env";

type MetaConnectionRow = {
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
};

type CachedAccountRow = {
  workspace_id: string;
  account_id: string;
  name: string;
  status: string | null;
  currency: string | null;
  timezone_name: string | null;
  balance_minor: string | null;
  raw_json: string;
  updated_at: string;
};

function normalizeQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim().toLowerCase();
}

class FakePreparedStatement implements D1PreparedStatementLike {
  private values: unknown[] = [];

  constructor(
    private readonly db: FakeD1Database,
    private readonly query: string
  ) {}

  bind(...values: unknown[]): D1PreparedStatementLike {
    this.values = values;
    return this;
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return this.db.first<T>(this.query, this.values);
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    return { results: await this.db.all<T>(this.query, this.values) };
  }

  async run(): Promise<unknown> {
    return this.db.run(this.query, this.values);
  }
}

export class FakeD1Database implements D1DatabaseLike {
  readonly metaConnections = new Map<string, MetaConnectionRow>();
  readonly cachedAccounts = new Map<string, Map<string, CachedAccountRow>>();

  prepare(query: string): D1PreparedStatementLike {
    return new FakePreparedStatement(this, query);
  }

  async first<T>(query: string, values: unknown[]): Promise<T | null> {
    const normalized = normalizeQuery(query);

    if (normalized.includes("from meta_connections")) {
      return (this.metaConnections.get(String(values[0])) as T | undefined) ?? null;
    }

    return null;
  }

  async all<T>(query: string, values: unknown[]): Promise<T[]> {
    const normalized = normalizeQuery(query);

    if (normalized.includes("from meta_ad_accounts_cache")) {
      const rows = this.cachedAccounts.get(String(values[0]));
      return Array.from(rows?.values() ?? []) as T[];
    }

    return [];
  }

  async run(query: string, values: unknown[]): Promise<unknown> {
    const normalized = normalizeQuery(query);

    if (normalized.startsWith("insert into meta_connections")) {
      const [
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
        updated_at,
      ] = values;

      this.metaConnections.set(String(workspace_id), {
        workspace_id: String(workspace_id),
        user_id: String(user_id),
        access_token_ciphertext: String(access_token_ciphertext),
        expires_at: (expires_at as number | null) ?? null,
        scopes_json: (scopes_json as string | null) ?? null,
        graph_user_id: (graph_user_id as string | null) ?? null,
        graph_user_name: (graph_user_name as string | null) ?? null,
        last_validated_at: (last_validated_at as string | null) ?? null,
        last_error: (last_error as string | null) ?? null,
        created_at: String(created_at),
        updated_at: String(updated_at),
      });
      return {};
    }

    if (normalized.startsWith("update meta_connections")) {
      const existing = this.metaConnections.get(String(values[3]));
      if (existing) {
        existing.last_validated_at = String(values[0]);
        existing.last_error = (values[1] as string | null) ?? null;
        existing.updated_at = String(values[2]);
      }
      return {};
    }

    if (normalized.startsWith("delete from meta_ad_accounts_cache")) {
      this.cachedAccounts.delete(String(values[0]));
      return {};
    }

    if (normalized.startsWith("insert into meta_ad_accounts_cache")) {
      const [
        workspace_id,
        account_id,
        name,
        status,
        currency,
        timezone_name,
        balance_minor,
        raw_json,
        updated_at,
      ] = values;
      const workspaceKey = String(workspace_id);
      const accounts = this.cachedAccounts.get(workspaceKey) ?? new Map();
      accounts.set(String(account_id), {
        workspace_id: workspaceKey,
        account_id: String(account_id),
        name: String(name),
        status: (status as string | null) ?? null,
        currency: (currency as string | null) ?? null,
        timezone_name: (timezone_name as string | null) ?? null,
        balance_minor: (balance_minor as string | null) ?? null,
        raw_json: String(raw_json),
        updated_at: String(updated_at),
      });
      this.cachedAccounts.set(workspaceKey, accounts);
      return {};
    }

    return {};
  }
}

export class FakeKVNamespace implements KVNamespaceLike {
  readonly data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

export function createTestBindings(
  overrides: Partial<AppBindings> = {}
): AppBindings {
  return {
    META_DB: new FakeD1Database(),
    META_OAUTH_STATE: new FakeKVNamespace(),
    JWT_SECRET: "test-secret",
    META_APP_ID: "meta-app-id",
    META_APP_SECRET: "meta-app-secret",
    META_TOKEN_ENCRYPTION_KEY: "test-encryption-secret",
    META_OAUTH_ALLOWED_RETURN_ORIGINS: "",
    ...overrides,
  };
}

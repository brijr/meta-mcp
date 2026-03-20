CREATE TABLE IF NOT EXISTS meta_connections (
  workspace_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  access_token_ciphertext TEXT NOT NULL,
  expires_at INTEGER,
  scopes_json TEXT,
  graph_user_id TEXT,
  graph_user_name TEXT,
  last_validated_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta_ad_accounts_cache (
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT,
  currency TEXT,
  timezone_name TEXT,
  balance_minor TEXT,
  raw_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, account_id)
);

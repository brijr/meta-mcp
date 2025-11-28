# Get Insights Tool – Parameters and Usage

This documents the MCP `get_insights` tool exposed by the Vercel deployment (`/api/mcp`) and the local MCP server. It lists every parameter, defaults, and how they interact.

## Call pattern (JSON-RPC over HTTP)

```bash
META_MCP_BASE_URL="https://<your-vercel-app>.vercel.app/api/mcp"
AUTH="Bearer <access-token>"

curl -X POST "$META_MCP_BASE_URL" \
  -H "Authorization: $AUTH" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": "test",
    "method": "tools/call",
    "params": {
      "name": "get_insights",
      "arguments": {
        "object_id": "act_<account_or_object_id>",
        "level": "campaign",
        "time_range": {"since": "2025-11-03", "until": "2025-11-05"},
        "time_increment": 1,
        "fields": ["date_start", "date_stop", "impressions", "clicks", "spend"],
        "breakdowns": ["age", "gender"],
        "limit": 50
      }
    }
  }'
```

## Parameters

- `object_id` (string, required): The ID to query. Accepts ad account (`act_...`), campaign, ad set, or ad IDs depending on `level`.
- `level` (enum, required): `"account" | "campaign" | "adset" | "ad"`. Controls aggregation level and which IDs are valid.
- `time_range` (object, optional): `{ since: "YYYY-MM-DD", until: "YYYY-MM-DD" }`. When provided, it takes precedence over `date_preset`.
- `date_preset` (enum, optional): One of `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `this_quarter`, `last_quarter`, `this_year`, `last_year`, `lifetime`. Used only when `time_range` is not provided. Default: `last_7d`.
- `time_increment` (number, optional): Bucket size in days for the results (e.g., `1` for daily, `7` for weekly-style buckets). Omit for a single aggregated range.
- `fields` (array<string>, optional): Metrics to return. If omitted, defaults to `impressions, clicks, spend, reach, frequency, ctr, cpc, cpm, actions, cost_per_action_type`. Include `campaign_name`, `adset_name`, or `ad_name` (plus their IDs) if you want names returned alongside performance data.
- `breakdowns` (array<string>, optional): Dimensions to segment by (e.g., `age`, `gender`, `placement`).
- `limit` (number, optional): Max records per page. Defaults to `25`. The schema allows up to `100`; Meta may cap larger values.
- `after` (string, optional): Cursor for pagination. Use `pagination.next_cursor` or `paging.cursors.after` from the previous response to fetch the next page.

## Behavior and defaults

- **Precedence:** `time_range` overrides `date_preset`. If neither is supplied, `date_preset` defaults to `last_7d`.
- **Pagination:** Responses include cursors (`hasNextPage`, `hasPreviousPage`, `paging.cursors.before/after`, and `pagination.next_cursor`). Pass the returned `after`/`next_cursor` value as `after` to fetch subsequent pages.
- **Ordering + limits:** When `time_increment` is set (e.g., daily) Meta returns rows oldest-first. With a low `limit` and per-ad or breakdown rows, the first page may stop after the earliest 2–3 days of a 7-day preset. Increase `limit` (up to 100) and request subsequent pages with the `after` cursor to cover the whole range.
- **No zero-fill:** Meta omits days with no delivery; if an ad account was idle, those dates will not appear and must be backfilled client-side if needed.
- **Fields default:** If `fields` is omitted, the default metrics listed above are sent to Meta.
- **Breakdowns:** Include only valid Meta breakdown names; invalid values will be rejected by the API.
- **time_increment:** Provide an integer day count. Leaving it out returns aggregated data for the whole range.
- **Loop guard:** If Meta echoes back the same `after` cursor you provided, the server will mark `has_next_page` as `false` to avoid pagination loops. Treat that response as the final page for that query.

## Minimal examples

**Custom date range, daily buckets**
```json
{
  "object_id": "act_123",
  "level": "campaign",
  "time_range": {"since": "2025-11-03", "until": "2025-11-05"},
  "time_increment": 1,
  "fields": ["date_start", "date_stop", "impressions", "clicks", "spend"],
  "limit": 100
}
```

**Preset range, aggregated**
```json
{
  "object_id": "act_123",
  "level": "account",
  "date_preset": "last_month",
  "fields": ["impressions", "clicks", "spend", "actions"],
  "breakdowns": ["age", "gender"]
}
```

**Include campaign names**
```json
{
  "object_id": "act_123",
  "level": "campaign",
  "date_preset": "last_7d",
  "fields": ["campaign_id", "campaign_name", "impressions", "clicks", "spend", "ctr"],
  "limit": 50
}
```

**Ad-level pull with custom metrics**
```json
{
  "object_id": "120238830325420237",
  "level": "ad",
  "time_range": {"since": "2025-10-01", "until": "2025-10-07"},
  "fields": ["date_start", "date_stop", "ad_id", "impressions", "clicks", "spend", "ctr", "cpc", "cpm"],
  "time_increment": 1,
  "limit": 50
}
```

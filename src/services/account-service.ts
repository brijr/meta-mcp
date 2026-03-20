import { MetaApiError } from "../lib/errors";
import { normalizeAdAccountId } from "../lib/meta/ids";
import type { MetaToolContext } from "../lib/tools/handler";
import {
  getCachedAdAccounts,
  replaceCachedAdAccounts,
  type CachedAdAccount,
} from "../lib/storage/ad-account-cache-repo";
import { markMetaConnectionValidation } from "../lib/storage/connection-repo";
import { toMetaItemResult, toMetaListResult } from "./shared";

const AD_ACCOUNT_FIELDS = [
  "id",
  "account_id",
  "name",
  "account_status",
  "currency",
  "timezone_name",
  "timezone_offset_hours_utc",
  "balance",
  "amount_spent",
  "business_country_code",
];

const PIXEL_FIELDS = ["id", "name", "code", "creation_time", "last_fired_time"];
const PAGE_FIELDS = ["id", "name", "category", "tasks", "perms"];

function normalizeAdAccount(item: Record<string, unknown>): CachedAdAccount {
  return {
    ...item,
    account_id:
      typeof item.account_id === "string"
        ? item.account_id
        : typeof item.id === "string"
          ? item.id.replace(/^act_/, "")
          : "",
    name: typeof item.name === "string" ? item.name : "Unnamed account",
    status:
      item.account_status != null ? String(item.account_status) : undefined,
    currency: typeof item.currency === "string" ? item.currency : undefined,
    timezone_name:
      typeof item.timezone_name === "string" ? item.timezone_name : undefined,
    balance_minor:
      typeof item.balance === "string" || typeof item.balance === "number"
        ? item.balance
        : null,
  };
}

export async function getAdAccountsService(
  args: {
    limit?: number;
    after?: string;
  },
  context: MetaToolContext
) {
  try {
    const response = await context.meta.list<Record<string, unknown>>(
      "me/adaccounts",
      {
        fields: AD_ACCOUNT_FIELDS.join(","),
        limit: args.limit,
        after: args.after,
      }
    );
    const items = response.items.map(normalizeAdAccount);
    await replaceCachedAdAccounts(context.auth.workspaceId, items);
    await markMetaConnectionValidation(context.auth.workspaceId, null);

    return {
      text: `Found ${items.length} Meta ad account(s).`,
      data: toMetaListResult(items, response.page),
    };
  } catch (error) {
    if (error instanceof MetaApiError) {
      const cached = await getCachedAdAccounts(context.auth.workspaceId);
      if (cached.length > 0) {
        return {
          text: `Returned ${cached.length} cached Meta ad account(s).`,
          data: toMetaListResult(cached),
        };
      }
    }

    throw error;
  }
}

export async function getPagesService(
  _args: {
    account_id: string;
  },
  context: MetaToolContext
) {
  const response = await context.meta.list<Record<string, unknown>>("me/accounts", {
    fields: PAGE_FIELDS.join(","),
  });

  return {
    text: `Found ${response.items.length} Facebook Page(s).`,
    data: toMetaListResult(response.items, response.page),
  };
}

export async function getPixelsService(
  args: {
    account_id: string;
  },
  context: MetaToolContext
) {
  const response = await context.meta.list<Record<string, unknown>>(
    `${normalizeAdAccountId(args.account_id)}/adspixels`,
    {
      fields: PIXEL_FIELDS.join(","),
    }
  );

  return {
    text: `Found ${response.items.length} Meta pixel(s).`,
    data: toMetaListResult(response.items, response.page),
  };
}

export async function getCustomConversionsService(
  args: {
    account_id: string;
    pixel_id?: string;
  },
  context: MetaToolContext
) {
  const path = args.pixel_id
    ? `${args.pixel_id}/customconversions`
    : `${normalizeAdAccountId(args.account_id)}/customconversions`;

  const response = await context.meta.list<Record<string, unknown>>(path, {
    fields: "id,name,event_source_type,custom_event_type,creation_time",
  });

  return {
    text: `Found ${response.items.length} custom conversion(s).`,
    data: toMetaListResult(response.items, response.page),
  };
}

export async function validateAccountService(
  args: {
    account_id: string;
  },
  context: MetaToolContext
) {
  const accountId = normalizeAdAccountId(args.account_id);
  const [account, pixels, pages, permissions] = await Promise.all([
    context.meta.get<Record<string, unknown>>(accountId, {
      fields: [
        "id",
        "account_id",
        "name",
        "account_status",
        "currency",
        "timezone_name",
        "disable_reason",
        "funding_source_details",
      ].join(","),
    }),
    context.meta.list<Record<string, unknown>>(`${accountId}/adspixels`, {
      fields: PIXEL_FIELDS.join(","),
      limit: 10,
    }),
    context.meta.list<Record<string, unknown>>("me/accounts", {
      fields: PAGE_FIELDS.join(","),
      limit: 10,
    }),
    context.meta.list<Record<string, unknown>>("me/permissions"),
  ]);

  const grantedPermissions = new Set(
    permissions.items
      .filter((item) => item.status === "granted")
      .map((item) => String(item.permission))
  );

  const item = {
    account: normalizeAdAccount(account),
    checks: {
      account_active:
        String(account.account_status ?? "") !== "3" &&
        String(account.disable_reason ?? "") !== "2",
      has_payment_method:
        account.funding_source_details !== null &&
        account.funding_source_details !== undefined,
      has_ads_management: grantedPermissions.has("ads_management"),
      has_business_management: grantedPermissions.has("business_management"),
      has_pixels: pixels.items.length > 0,
      has_pages: pages.items.length > 0,
    },
    pixels: pixels.items,
    pages: pages.items,
  };

  await markMetaConnectionValidation(context.auth.workspaceId, null);

  return {
    text: `Validated Meta account ${item.account.account_id}.`,
    data: toMetaItemResult(item),
  };
}

import { ValidationError } from "../lib/errors";
import { normalizeAdAccountId } from "../lib/meta/ids";
import type { MetaToolContext } from "../lib/tools/handler";
import { compact, omitUndefined } from "../lib/utils/object";
import {
  ensureOneOf,
  toMetaItemResult,
  toMetaListResult,
  withMetaOverrides,
} from "./shared";

const AD_FIELDS = [
  "id",
  "account_id",
  "adset_id",
  "campaign_id",
  "name",
  "status",
  "effective_status",
  "creative{id,name}",
  "created_time",
  "updated_time",
];

function base64ToBlob(base64: string, type: string): Blob {
  const raw = atob(base64);
  const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
  return new Blob([bytes], { type });
}

export interface InlineCreativeSpec {
  name?: string;
  page_id?: string;
  message?: string;
  headline?: string;
  link?: string;
  image_hash?: string;
  call_to_action?: string;
  description?: string;
  creative_spec?: Record<string, unknown>;
  meta_overrides?: Record<string, unknown>;
}

export function buildAdCreativePayload(
  spec: InlineCreativeSpec
): Record<string, unknown> {
  if (spec.creative_spec) {
    return withMetaOverrides(
      {
        name: spec.name ?? "Generated creative",
        ...spec.creative_spec,
      },
      spec.meta_overrides
    );
  }

  if (!spec.page_id || !spec.link) {
    throw new ValidationError(
      "create_ad_creative requires page_id and link unless creative_spec is provided."
    );
  }

  return withMetaOverrides(
    omitUndefined({
      name: spec.name ?? "Generated creative",
      object_story_spec: {
        page_id: spec.page_id,
        link_data: omitUndefined({
          message: spec.message,
          name: spec.headline,
          link: spec.link,
          image_hash: spec.image_hash,
          description: spec.description,
          call_to_action: spec.call_to_action
            ? {
                type: spec.call_to_action,
                value: {
                  link: spec.link,
                },
              }
            : undefined,
        }),
      },
    }),
    spec.meta_overrides
  );
}

export async function createInlineCreative(
  context: MetaToolContext,
  accountId: string,
  spec: InlineCreativeSpec
): Promise<string> {
  const created = await context.meta.post<{ id: string }>(
    `${normalizeAdAccountId(accountId)}/adcreatives`,
    buildAdCreativePayload(spec)
  );
  return created.id;
}

export async function getAdEntity(context: MetaToolContext, adId: string) {
  return context.meta.get<Record<string, unknown>>(adId, {
    fields: AD_FIELDS.join(","),
  });
}

export async function listAdsForParent(
  context: MetaToolContext,
  args: {
    ad_set_id?: string;
    campaign_id?: string;
    status?: string;
    limit?: number;
    after?: string;
  }
) {
  const parentId = ensureOneOf(
    [args.ad_set_id, args.campaign_id],
    "Specify exactly one of ad_set_id or campaign_id."
  );
  const edge = args.ad_set_id ? "ads" : "ads";

  const response = await context.meta.list<Record<string, unknown>>(
    `${parentId}/${edge}`,
    {
      fields: AD_FIELDS.join(","),
      limit: args.limit,
      after: args.after,
    }
  );

  return {
    items: response.items.filter((item) =>
      args.status
        ? String(item.status ?? item.effective_status ?? "").toLowerCase() ===
          args.status.toLowerCase()
        : true
    ),
    page: response.page,
  };
}

export async function uploadImageService(
  args: {
    account_id: string;
    image_url?: string;
    image_base64?: string;
  },
  context: MetaToolContext
) {
  if (!args.image_url && !args.image_base64) {
    throw new ValidationError(
      "Provide either image_url or image_base64 to upload_image."
    );
  }

  const payload = args.image_url
    ? { url: args.image_url }
    : { bytes: args.image_base64 };
  const created = await context.meta.post<Record<string, unknown>>(
    `${args.account_id.startsWith("act_") ? args.account_id : `act_${args.account_id}`}/adimages`,
    payload
  );

  const images =
    created.images && typeof created.images === "object"
      ? Object.values(created.images as Record<string, unknown>)
      : [];
  const image = images[0] as Record<string, unknown> | undefined;

  return {
    text: `Uploaded image for ad account ${args.account_id}.`,
    data: toMetaItemResult({
      image_hash: image?.hash,
      url: image?.url,
      raw: created,
    }),
  };
}

export async function createAdCreativeService(
  args: {
    account_id: string;
    name: string;
    page_id?: string;
    message?: string;
    headline?: string;
    link?: string;
    image_hash?: string;
    call_to_action?: string;
    description?: string;
    meta_overrides?: Record<string, unknown>;
  },
  context: MetaToolContext
) {
  const created = await context.meta.post<{ id: string }>(
    `${args.account_id.startsWith("act_") ? args.account_id : `act_${args.account_id}`}/adcreatives`,
    buildAdCreativePayload({
      ...args,
      name: args.name,
    })
  );

  return {
    text: `Created ad creative ${created.id}.`,
    data: toMetaItemResult({
      id: created.id,
      name: args.name,
    }),
  };
}

export async function createAdService(
  args: {
    ad_set_id: string;
    creative_id: string;
    name: string;
    status?: string;
    meta_overrides?: Record<string, unknown>;
  },
  context: MetaToolContext
) {
  const payload = withMetaOverrides(
    {
      name: args.name,
      status: args.status ?? "PAUSED",
      creative: {
        creative_id: args.creative_id,
      },
    },
    args.meta_overrides
  );

  const created = await context.meta.post<{ id: string }>(
    `${args.ad_set_id}/ads`,
    payload
  );
  const item = await getAdEntity(context, created.id);

  return {
    text: `Created ad ${created.id}.`,
    data: toMetaItemResult(item),
  };
}

export async function updateAdService(
  args: {
    ad_id: string;
    status?: string;
    creative_id?: string;
    name?: string;
    meta_overrides?: Record<string, unknown>;
  },
  context: MetaToolContext
) {
  const payload = withMetaOverrides(
    omitUndefined({
      status: args.status,
      name: args.name,
      creative: args.creative_id
        ? {
            creative_id: args.creative_id,
          }
        : undefined,
    }),
    args.meta_overrides
  );
  await context.meta.post(args.ad_id, payload);
  const item = await getAdEntity(context, args.ad_id);

  return {
    text: `Updated ad ${args.ad_id}.`,
    data: toMetaItemResult(item),
  };
}

export async function getAdService(
  args: {
    ad_id: string;
  },
  context: MetaToolContext
) {
  const item = await getAdEntity(context, args.ad_id);
  const creativeId =
    item.creative &&
    typeof item.creative === "object" &&
    typeof (item.creative as Record<string, unknown>).id === "string"
      ? ((item.creative as Record<string, unknown>).id as string)
      : null;

  let preview: Record<string, unknown> | null = null;
  if (creativeId) {
    const previewResponse = await context.meta.list<Record<string, unknown>>(
      `${creativeId}/previews`,
      {
        ad_format: "DESKTOP_FEED_STANDARD",
      }
    );
    preview = previewResponse.items[0] ?? null;
  }

  return {
    text: `Loaded ad ${args.ad_id}.`,
    data: toMetaItemResult({
      ...item,
      preview,
    }),
  };
}

export async function listAdsService(
  args: {
    ad_set_id?: string;
    campaign_id?: string;
    status?: string;
    limit?: number;
    after?: string;
  },
  context: MetaToolContext
) {
  const response = await listAdsForParent(context, args);
  return {
    text: `Found ${response.items.length} ad(s).`,
    data: toMetaListResult(response.items, response.page),
  };
}

export async function getAdPreviewService(
  args: {
    creative_id: string;
    ad_format: string;
  },
  context: MetaToolContext
) {
  const response = await context.meta.list<Record<string, unknown>>(
    `${args.creative_id}/previews`,
    {
      ad_format: args.ad_format,
    }
  );

  return {
    text: `Generated ${response.items.length} ad preview(s).`,
    data: toMetaListResult(response.items, response.page),
  };
}

export async function uploadVideoService(
  args: {
    account_id: string;
    video_url?: string;
    video_base64?: string;
  },
  context: MetaToolContext
) {
  if (!args.video_url && !args.video_base64) {
    throw new ValidationError(
      "Provide either video_url or video_base64 to upload_video."
    );
  }

  let response: { id?: string };
  if (args.video_url) {
    response = await context.meta.post<{ id: string }>(
      `${args.account_id.startsWith("act_") ? args.account_id : `act_${args.account_id}`}/advideos`,
      {
        file_url: args.video_url,
      }
    );
  } else {
    const formData = new FormData();
    formData.set(
      "source",
      base64ToBlob(args.video_base64 as string, "video/mp4"),
      "upload.mp4"
    );
    response = await context.meta.postFormData<{ id: string }>(
      `${args.account_id.startsWith("act_") ? args.account_id : `act_${args.account_id}`}/advideos`,
      formData
    );
  }

  return {
    text: `Uploaded video ${response.id ?? ""}.`,
    data: toMetaItemResult({
      video_id: response.id,
    }),
  };
}

export async function getVideoStatusService(
  args: {
    video_id: string;
  },
  context: MetaToolContext
) {
  const item = await context.meta.get<Record<string, unknown>>(args.video_id, {
    fields: compact([
      "id",
      "source",
      "status",
      "processing_progress",
      "created_time",
    ]).join(","),
  });

  return {
    text: `Loaded video status for ${args.video_id}.`,
    data: toMetaItemResult(item),
  };
}

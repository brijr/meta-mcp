import type { MetaToolContext } from "../lib/tools/handler";
import {
  createInlineCreative,
  getAdEntity,
  listAdsForParent,
} from "./creative-service";
import { getCampaignEntity } from "./campaign-service";
import { getAdSetEntity, listAdSetEntities } from "./ad-set-service";
import { toMetaItemResult } from "./shared";

interface BulkAdSpec {
  name: string;
  status?: string;
  creative_id?: string;
  creative_spec?: Record<string, unknown>;
  page_id?: string;
  message?: string;
  headline?: string;
  link?: string;
  image_hash?: string;
  call_to_action?: string;
  description?: string;
  meta_overrides?: Record<string, unknown>;
}

function splitCloneOverrides(overrides?: Record<string, unknown>) {
  if (!overrides) {
    return {
      campaign: undefined,
      ad_set: undefined,
      ad: undefined,
    };
  }

  return {
    campaign:
      overrides.campaign && typeof overrides.campaign === "object"
        ? (overrides.campaign as Record<string, unknown>)
        : overrides,
    ad_set:
      overrides.ad_set && typeof overrides.ad_set === "object"
        ? (overrides.ad_set as Record<string, unknown>)
        : undefined,
    ad:
      overrides.ad && typeof overrides.ad === "object"
        ? (overrides.ad as Record<string, unknown>)
        : undefined,
  };
}

async function ensureCreativeId(
  context: MetaToolContext,
  accountId: string,
  spec: BulkAdSpec
): Promise<string> {
  if (spec.creative_id) {
    return spec.creative_id;
  }

  return createInlineCreative(context, accountId, {
    name: `${spec.name} creative`,
    page_id: spec.page_id,
    message: spec.message,
    headline: spec.headline,
    link: spec.link,
    image_hash: spec.image_hash,
    call_to_action: spec.call_to_action,
    description: spec.description,
    creative_spec: spec.creative_spec,
    meta_overrides: spec.meta_overrides,
  });
}

export async function bulkCreateAdsService(
  args: {
    ad_set_id: string;
    ads: BulkAdSpec[];
  },
  context: MetaToolContext
) {
  const adSet = await getAdSetEntity(context, args.ad_set_id);
  const accountId = String(adSet.account_id);
  const results: Array<Record<string, unknown>> = [];
  const errors: Array<Record<string, unknown>> = [];

  for (const spec of args.ads) {
    try {
      const creativeId = await ensureCreativeId(context, accountId, spec);
      const created = await context.meta.post<{ id: string }>(
        `${args.ad_set_id}/ads`,
        {
          name: spec.name,
          status: spec.status ?? "PAUSED",
          creative: {
            creative_id: creativeId,
          },
        }
      );

      results.push({
        input_name: spec.name,
        id: created.id,
        creative_id: creativeId,
      });
    } catch (error) {
      results.push({
        input_name: spec.name,
        ok: false,
      });
      errors.push({
        input_name: spec.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    text: `Processed ${args.ads.length} ad create request(s).`,
    data: {
      results,
      errors,
    },
  };
}

export async function bulkUpdateStatusService(
  args: {
    object_ids: string[];
    status: string;
  },
  context: MetaToolContext
) {
  const results: Array<Record<string, unknown>> = [];
  const errors: Array<Record<string, unknown>> = [];

  for (const objectId of args.object_ids) {
    try {
      await context.meta.post(objectId, {
        status: args.status,
      });
      results.push({
        id: objectId,
        status: args.status,
      });
    } catch (error) {
      errors.push({
        id: objectId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    text: `Updated ${results.length} object(s) to ${args.status}.`,
    data: {
      results,
      errors,
    },
  };
}

export async function cloneCampaignStructureService(
  args: {
    campaign_id: string;
    overrides?: Record<string, unknown>;
  },
  context: MetaToolContext
) {
  const sourceCampaign = await getCampaignEntity(context, args.campaign_id);
  const adSets = await listAdSetEntities(context, {
    campaign_id: args.campaign_id,
  });
  const overrides = splitCloneOverrides(args.overrides);

  const campaignCreate = await context.meta.post<{ id: string }>(
    `act_${String(sourceCampaign.account_id ?? "").replace(/^act_/, "")}/campaigns`,
    {
      name:
        typeof sourceCampaign.name === "string"
          ? `${sourceCampaign.name} Copy`
          : "Cloned campaign",
      objective: sourceCampaign.objective,
      buying_type: sourceCampaign.buying_type,
      special_ad_categories: sourceCampaign.special_ad_categories,
      status: "PAUSED",
      ...(overrides.campaign ?? {}),
    }
  );

  const adSetResults: Array<Record<string, unknown>> = [];
  for (const sourceAdSet of adSets.items) {
    const newAdSet = await context.meta.post<{ id: string }>(
      `${campaignCreate.id}/adsets`,
      {
        name:
          typeof sourceAdSet.name === "string"
            ? `${sourceAdSet.name} Copy`
            : "Cloned ad set",
        targeting: sourceAdSet.targeting,
        optimization_goal: sourceAdSet.optimization_goal,
        billing_event: sourceAdSet.billing_event,
        daily_budget: sourceAdSet.daily_budget,
        lifetime_budget: sourceAdSet.lifetime_budget,
        bid_amount: sourceAdSet.bid_amount,
        start_time: sourceAdSet.start_time,
        end_time: sourceAdSet.end_time,
        status: "PAUSED",
        promoted_object: sourceAdSet.promoted_object,
        attribution_spec: sourceAdSet.attribution_spec,
        ...(overrides.ad_set ?? {}),
      }
    );

    const sourceAds = await listAdsForParent(context, {
      ad_set_id: String(sourceAdSet.id),
    });
    const clonedAds: Array<Record<string, unknown>> = [];
    for (const sourceAd of sourceAds.items) {
      const adDetails = await getAdEntity(context, String(sourceAd.id));
      const creativeId =
        adDetails.creative &&
        typeof adDetails.creative === "object" &&
        typeof (adDetails.creative as Record<string, unknown>).id === "string"
          ? ((adDetails.creative as Record<string, unknown>).id as string)
          : null;

      if (!creativeId) {
        continue;
      }

      const createdAd = await context.meta.post<{ id: string }>(
        `${newAdSet.id}/ads`,
        {
          name:
            typeof sourceAd.name === "string"
              ? `${sourceAd.name} Copy`
              : "Cloned ad",
          status: "PAUSED",
          creative: {
            creative_id: creativeId,
          },
          ...(overrides.ad ?? {}),
        }
      );
      clonedAds.push({
        source_ad_id: sourceAd.id,
        cloned_ad_id: createdAd.id,
      });
    }

    adSetResults.push({
      source_ad_set_id: sourceAdSet.id,
      cloned_ad_set_id: newAdSet.id,
      ads: clonedAds,
    });
  }

  return {
    text: `Cloned campaign ${args.campaign_id} into ${campaignCreate.id}.`,
    data: toMetaItemResult({
      campaign_id: campaignCreate.id,
      ad_sets: adSetResults,
    }),
  };
}

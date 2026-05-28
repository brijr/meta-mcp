import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import {
  budgetSchema,
  metaIdSchema,
  metaOverridesSchema,
  scheduleSchema,
  jsonObjectSchema,
} from "../../lib/tools/schemas";
import { createAdSetService } from "../../services/ad-set-service";

export const schema = {
  campaign_id: metaIdSchema,
  name: z.string(),
  targeting: jsonObjectSchema,
  optimization_goal: z
    .string()
    .describe(
      "Meta optimization goal, e.g. LINK_CLICKS, LANDING_PAGE_VIEWS, OFFSITE_CONVERSIONS, REACH, IMPRESSIONS, LEAD_GENERATION, THRUPLAY. Must be compatible with billing_event and the campaign objective."
    ),
  billing_event: z
    .string()
    .describe(
      "How you are charged, e.g. IMPRESSIONS, LINK_CLICKS, THRUPLAY. Must be a valid pairing for optimization_goal (e.g. OFFSITE_CONVERSIONS bills on IMPRESSIONS; LINK_CLICKS optimization can bill on LINK_CLICKS or IMPRESSIONS)."
    ),
  promoted_object: jsonObjectSchema
    .optional()
    .describe(
      "Required for conversion/lead objectives (e.g. OUTCOME_LEADS, OUTCOME_SALES). Example: { pixel_id, custom_event_type: 'PURCHASE' } or { page_id }."
    ),
  budget: budgetSchema,
  schedule: scheduleSchema.optional(),
  status: z.string().optional(),
  bid_amount: z.number().int().optional(),
  meta_overrides: metaOverridesSchema,
};

export const metadata = createToolMetadata(
  "create_ad_set",
  "Create a Meta ad set under a campaign.",
  false
);

export default createMetaToolHandler(createAdSetService);

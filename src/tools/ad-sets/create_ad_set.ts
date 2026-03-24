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
  optimization_goal: z.string(),
  billing_event: z.string(),
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

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
import { updateAdSetService } from "../../services/ad-set-service";

export const schema = {
  ad_set_id: metaIdSchema,
  targeting: jsonObjectSchema.optional(),
  budget: budgetSchema.optional(),
  schedule: scheduleSchema.optional(),
  status: z.string().optional(),
  bid_amount: z.number().int().optional(),
  optimization_goal: z.string().optional(),
  billing_event: z.string().optional(),
  meta_overrides: metaOverridesSchema,
};

export const metadata = createToolMetadata(
  "update_ad_set",
  "Update a Meta ad set.",
  false
);

export default createMetaToolHandler(updateAdSetService);

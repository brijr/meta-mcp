import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import {
  budgetSchema,
  metaIdSchema,
  metaOverridesSchema,
} from "../../lib/tools/schemas";
import { createCampaignService } from "../../services/campaign-service";

export const schema = {
  account_id: metaIdSchema,
  name: z.string(),
  objective: z.string(),
  buying_type: z.string().optional(),
  special_ad_categories: z.array(z.string()).optional(),
  status: z.string().optional(),
  budget: budgetSchema.optional(),
  meta_overrides: metaOverridesSchema,
};

export const metadata = createToolMetadata(
  "create_campaign",
  "Create a Meta campaign on an ad account.",
  false
);

export default createMetaToolHandler(createCampaignService);

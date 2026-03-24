import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import {
  budgetSchema,
  metaIdSchema,
  metaOverridesSchema,
} from "../../lib/tools/schemas";
import { updateCampaignService } from "../../services/campaign-service";

export const schema = {
  campaign_id: metaIdSchema,
  name: z.string().optional(),
  status: z.string().optional(),
  budget: budgetSchema.optional(),
  bid_strategy: z.string().optional(),
  meta_overrides: metaOverridesSchema,
};

export const metadata = createToolMetadata(
  "update_campaign",
  "Update a Meta campaign.",
  false
);

export default createMetaToolHandler(updateCampaignService);

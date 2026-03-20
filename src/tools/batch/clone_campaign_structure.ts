import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema, metaOverridesSchema } from "../../lib/tools/schemas";
import { cloneCampaignStructureService } from "../../services/batch-service";

export const schema = {
  campaign_id: metaIdSchema,
  overrides: metaOverridesSchema,
};

export const metadata = createToolMetadata(
  "clone_campaign_structure",
  "Deep-clone a campaign with its ad sets and ads.",
  false
);

export default createMetaToolHandler(cloneCampaignStructureService);

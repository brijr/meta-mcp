import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema } from "../../lib/tools/schemas";
import { getCampaignService } from "../../services/campaign-service";

export const schema = {
  campaign_id: metaIdSchema,
};

export const metadata = createToolMetadata(
  "get_campaign",
  "Get campaign details by campaign ID.",
  true
);

export default createMetaToolHandler(getCampaignService);

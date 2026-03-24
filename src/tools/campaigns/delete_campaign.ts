import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema } from "../../lib/tools/schemas";
import { deleteCampaignService } from "../../services/campaign-service";

export const schema = {
  campaign_id: metaIdSchema,
};

export const metadata = createToolMetadata(
  "delete_campaign",
  "Delete or archive a Meta campaign.",
  false
);

export default createMetaToolHandler(deleteCampaignService);

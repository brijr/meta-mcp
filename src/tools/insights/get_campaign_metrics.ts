import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { dateRangeSchema, metaIdSchema } from "../../lib/tools/schemas";
import { getCampaignMetricsService } from "../../services/insights-service";

export const schema = {
  campaign_id: metaIdSchema,
  date_range: dateRangeSchema.optional(),
};

export const metadata = createToolMetadata(
  "get_campaign_metrics",
  "Get key metrics for a Meta campaign.",
  true
);

export default createMetaToolHandler(getCampaignMetricsService);

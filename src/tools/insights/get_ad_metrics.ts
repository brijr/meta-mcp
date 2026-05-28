import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { dateRangeSchema, metaIdSchema } from "../../lib/tools/schemas";
import { getAdMetricsService } from "../../services/insights-service";

export const schema = {
  ad_id: metaIdSchema,
  date_range: dateRangeSchema.optional(),
};

export const metadata = createToolMetadata(
  "get_ad_metrics",
  "Get key metrics for a Meta ad.",
  true
);

export default createMetaToolHandler(getAdMetricsService);

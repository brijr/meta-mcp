import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { dateRangeSchema, metaIdSchema } from "../../lib/tools/schemas";
import { getAdSetMetricsService } from "../../services/insights-service";

export const schema = {
  ad_set_id: metaIdSchema,
  date_range: dateRangeSchema.optional(),
};

export const metadata = createToolMetadata(
  "get_adset_metrics",
  "Get key metrics for a Meta ad set.",
  true
);

export default createMetaToolHandler(getAdSetMetricsService);

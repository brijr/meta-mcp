import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { dateRangeSchema, metaIdSchema } from "../../lib/tools/schemas";
import { getInsightsService } from "../../services/insights-service";

export const schema = {
  object_id: metaIdSchema,
  level: z.string(),
  metrics: z.array(z.string()).min(1),
  date_range: dateRangeSchema.optional(),
  breakdowns: z.array(z.string()).optional(),
};

export const metadata = createToolMetadata(
  "get_insights",
  "Pull Meta performance insights for a campaign, ad set, or ad.",
  true
);

export default createMetaToolHandler(getInsightsService);

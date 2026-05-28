import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { dateRangeSchema, metaIdSchema } from "../../lib/tools/schemas";
import { compareAdsService } from "../../services/insights-service";

export const schema = {
  ad_ids: z.array(metaIdSchema).min(1),
  metrics: z.array(z.string()).optional(),
  date_range: dateRangeSchema.optional(),
};

export const metadata = createToolMetadata(
  "compare_ads",
  "Compare metrics across multiple Meta ads.",
  true
);

export default createMetaToolHandler(compareAdsService);

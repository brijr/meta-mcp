import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { dateRangeSchema, metaIdSchema } from "../../lib/tools/schemas";
import { getConversionDataService } from "../../services/insights-service";

export const schema = {
  object_id: metaIdSchema,
  level: z.string(),
  date_range: dateRangeSchema.optional(),
};

export const metadata = createToolMetadata(
  "get_conversion_data",
  "Get conversion-focused insight rows for a Meta object.",
  true
);

export default createMetaToolHandler(getConversionDataService);

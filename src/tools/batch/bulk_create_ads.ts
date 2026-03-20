import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema } from "../../lib/tools/schemas";
import { bulkCreateAdsService } from "../../services/batch-service";

const bulkAdSchema = z
  .object({
    name: z.string(),
    status: z.string().optional(),
    creative_id: metaIdSchema.optional(),
    creative_spec: z.record(z.string(), z.any()).optional(),
    page_id: metaIdSchema.optional(),
    message: z.string().optional(),
    headline: z.string().optional(),
    link: z.string().optional(),
    image_hash: z.string().optional(),
    call_to_action: z.string().optional(),
    description: z.string().optional(),
    meta_overrides: z.record(z.string(), z.any()).optional(),
  })
  .passthrough();

export const schema = {
  ad_set_id: metaIdSchema,
  ads: z.array(bulkAdSchema).min(1),
};

export const metadata = createToolMetadata(
  "bulk_create_ads",
  "Create multiple Meta ads in a single tool call.",
  false
);

export default createMetaToolHandler(bulkCreateAdsService);

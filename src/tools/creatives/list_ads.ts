import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema, paginationSchema } from "../../lib/tools/schemas";
import { listAdsService } from "../../services/creative-service";

export const schema = {
  ad_set_id: metaIdSchema.optional(),
  campaign_id: metaIdSchema.optional(),
  status: z.string().optional(),
  ...paginationSchema,
};

export const metadata = createToolMetadata(
  "list_ads",
  "List ads under an ad set or campaign.",
  true
);

export default createMetaToolHandler(listAdsService);

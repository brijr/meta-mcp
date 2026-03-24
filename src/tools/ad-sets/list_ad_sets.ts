import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema, paginationSchema } from "../../lib/tools/schemas";
import { listAdSetsService } from "../../services/ad-set-service";

export const schema = {
  campaign_id: metaIdSchema,
  status: z.string().optional(),
  ...paginationSchema,
};

export const metadata = createToolMetadata(
  "list_ad_sets",
  "List ad sets under a campaign.",
  true
);

export default createMetaToolHandler(listAdSetsService);

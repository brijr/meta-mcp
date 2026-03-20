import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import {
  dateRangeSchema,
  metaIdSchema,
  paginationSchema,
} from "../../lib/tools/schemas";
import { listCampaignsService } from "../../services/campaign-service";

export const schema = {
  account_id: metaIdSchema,
  status: z.string().optional(),
  objective: z.string().optional(),
  date_range: dateRangeSchema.optional(),
  ...paginationSchema,
};

export const metadata = createToolMetadata(
  "list_campaigns",
  "List campaigns on an ad account.",
  true
);

export default createMetaToolHandler(listCampaignsService);

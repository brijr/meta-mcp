import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema, paginationSchema } from "../../lib/tools/schemas";
import { listAudiencesService } from "../../services/audience-service";

export const schema = {
  account_id: metaIdSchema,
  type: z.string().optional(),
  ...paginationSchema,
};

export const metadata = createToolMetadata(
  "list_audiences",
  "List custom and saved Meta audiences.",
  true
);

export default createMetaToolHandler(listAudiencesService);

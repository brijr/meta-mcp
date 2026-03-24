import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema } from "../../lib/tools/schemas";
import { getPagesService } from "../../services/account-service";

export const schema = {
  account_id: metaIdSchema,
  include_all_pages: z.boolean().optional(),
};

export const metadata = createToolMetadata(
  "get_pages",
  "List Facebook Pages that can be used with the connected Meta identity.",
  true
);

export default createMetaToolHandler(getPagesService);

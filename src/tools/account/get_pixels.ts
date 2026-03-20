import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema } from "../../lib/tools/schemas";
import { getPixelsService } from "../../services/account-service";

export const schema = {
  account_id: metaIdSchema,
};

export const metadata = createToolMetadata(
  "get_pixels",
  "List Meta Pixels available on an ad account.",
  true
);

export default createMetaToolHandler(getPixelsService);

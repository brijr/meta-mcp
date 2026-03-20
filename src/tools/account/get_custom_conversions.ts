import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema } from "../../lib/tools/schemas";
import { getCustomConversionsService } from "../../services/account-service";

export const schema = {
  account_id: metaIdSchema,
  pixel_id: metaIdSchema.optional(),
};

export const metadata = createToolMetadata(
  "get_custom_conversions",
  "List custom conversions for an ad account or a specific pixel.",
  true
);

export default createMetaToolHandler(getCustomConversionsService);

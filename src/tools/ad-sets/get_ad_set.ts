import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema } from "../../lib/tools/schemas";
import { getAdSetService } from "../../services/ad-set-service";

export const schema = {
  ad_set_id: metaIdSchema,
};

export const metadata = createToolMetadata(
  "get_ad_set",
  "Get a Meta ad set by ID.",
  true
);

export default createMetaToolHandler(getAdSetService);

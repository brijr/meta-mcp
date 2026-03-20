import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema } from "../../lib/tools/schemas";
import { getAdService } from "../../services/creative-service";

export const schema = {
  ad_id: metaIdSchema,
};

export const metadata = createToolMetadata(
  "get_ad",
  "Get a Meta ad by ID.",
  true
);

export default createMetaToolHandler(getAdService);

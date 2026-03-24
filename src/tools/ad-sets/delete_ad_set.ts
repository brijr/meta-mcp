import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema } from "../../lib/tools/schemas";
import { deleteAdSetService } from "../../services/ad-set-service";

export const schema = {
  ad_set_id: metaIdSchema,
};

export const metadata = createToolMetadata(
  "delete_ad_set",
  "Delete a Meta ad set.",
  false
);

export default createMetaToolHandler(deleteAdSetService);

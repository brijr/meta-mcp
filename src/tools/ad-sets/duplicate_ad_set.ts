import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema, metaOverridesSchema } from "../../lib/tools/schemas";
import { duplicateAdSetService } from "../../services/ad-set-service";

export const schema = {
  ad_set_id: metaIdSchema,
  overrides: metaOverridesSchema,
};

export const metadata = createToolMetadata(
  "duplicate_ad_set",
  "Clone an existing ad set with optional overrides.",
  false
);

export default createMetaToolHandler(duplicateAdSetService);

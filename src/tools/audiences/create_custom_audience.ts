import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import {
  jsonObjectSchema,
  metaIdSchema,
  metaOverridesSchema,
} from "../../lib/tools/schemas";
import { createCustomAudienceService } from "../../services/audience-service";

export const schema = {
  account_id: metaIdSchema,
  name: z.string(),
  source_type: z.string(),
  config: jsonObjectSchema,
  meta_overrides: metaOverridesSchema,
};

export const metadata = createToolMetadata(
  "create_custom_audience",
  "Create a Meta custom audience.",
  false
);

export default createMetaToolHandler(createCustomAudienceService);

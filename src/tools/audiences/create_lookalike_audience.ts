import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema, metaOverridesSchema } from "../../lib/tools/schemas";
import { createLookalikeAudienceService } from "../../services/audience-service";

export const schema = {
  account_id: metaIdSchema,
  source_audience_id: metaIdSchema,
  country: z.string().length(2),
  ratio: z.number().positive().max(0.2),
  name: z.string().optional(),
  meta_overrides: metaOverridesSchema,
};

export const metadata = createToolMetadata(
  "create_lookalike_audience",
  "Create a Meta lookalike audience.",
  false
);

export default createMetaToolHandler(createLookalikeAudienceService);

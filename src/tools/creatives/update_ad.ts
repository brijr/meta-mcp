import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import {
  metaIdSchema,
  metaOverridesSchema,
} from "../../lib/tools/schemas";
import { updateAdService } from "../../services/creative-service";

export const schema = {
  ad_id: metaIdSchema,
  status: z.string().optional(),
  creative_id: metaIdSchema.optional(),
  name: z.string().optional(),
  meta_overrides: metaOverridesSchema,
};

export const metadata = createToolMetadata(
  "update_ad",
  "Update a Meta ad.",
  false
);

export default createMetaToolHandler(updateAdService);

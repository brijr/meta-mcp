import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import {
  metaIdSchema,
  metaOverridesSchema,
} from "../../lib/tools/schemas";
import { createAdService } from "../../services/creative-service";

export const schema = {
  ad_set_id: metaIdSchema,
  creative_id: metaIdSchema,
  name: z.string(),
  status: z.string().optional(),
  meta_overrides: metaOverridesSchema,
};

export const metadata = createToolMetadata(
  "create_ad",
  "Create a Meta ad under an ad set.",
  false
);

export default createMetaToolHandler(createAdService);

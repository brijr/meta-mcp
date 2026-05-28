import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import {
  metaIdSchema,
  metaOverridesSchema,
} from "../../lib/tools/schemas";
import { createAdCreativeService } from "../../services/creative-service";

export const schema = {
  account_id: metaIdSchema,
  name: z.string(),
  page_id: metaIdSchema.optional(),
  message: z.string().optional(),
  headline: z.string().optional(),
  link: z.string().optional(),
  image_hash: z.string().optional(),
  call_to_action: z.string().optional(),
  description: z.string().optional(),
  meta_overrides: metaOverridesSchema,
};

export const metadata = createToolMetadata(
  "create_ad_creative",
  "Create a Meta ad creative.",
  false
);

export default createMetaToolHandler(createAdCreativeService);

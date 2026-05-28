import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema } from "../../lib/tools/schemas";
import { getAdPreviewService } from "../../services/creative-service";

export const schema = {
  creative_id: metaIdSchema,
  ad_format: z.string(),
};

export const metadata = createToolMetadata(
  "get_ad_preview",
  "Generate ad previews for a creative and placement format.",
  true
);

export default createMetaToolHandler(getAdPreviewService);

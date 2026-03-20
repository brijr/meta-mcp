import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema } from "../../lib/tools/schemas";
import { uploadVideoService } from "../../services/creative-service";

export const schema = {
  account_id: metaIdSchema,
  video_url: z.string().optional(),
  video_base64: z.string().optional(),
};

export const metadata = createToolMetadata(
  "upload_video",
  "Upload a video asset to a Meta ad account.",
  false
);

export default createMetaToolHandler(uploadVideoService);

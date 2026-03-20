import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema } from "../../lib/tools/schemas";
import { uploadImageService } from "../../services/creative-service";

export const schema = {
  account_id: metaIdSchema,
  image_url: z.string().optional(),
  image_base64: z.string().optional(),
};

export const metadata = createToolMetadata(
  "upload_image",
  "Upload an image to a Meta ad account.",
  false
);

export default createMetaToolHandler(uploadImageService);

import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema } from "../../lib/tools/schemas";
import { getVideoStatusService } from "../../services/creative-service";

export const schema = {
  video_id: metaIdSchema,
};

export const metadata = createToolMetadata(
  "get_video_status",
  "Get processing status for a Meta video asset.",
  true
);

export default createMetaToolHandler(getVideoStatusService);

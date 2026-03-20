import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema } from "../../lib/tools/schemas";
import { bulkUpdateStatusService } from "../../services/batch-service";

export const schema = {
  object_ids: z.array(metaIdSchema).min(1),
  status: z.string(),
};

export const metadata = createToolMetadata(
  "bulk_update_status",
  "Update status for many Meta objects at once.",
  false
);

export default createMetaToolHandler(bulkUpdateStatusService);

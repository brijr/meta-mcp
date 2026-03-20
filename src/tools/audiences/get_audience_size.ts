import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import {
  jsonObjectSchema,
  metaIdSchema,
} from "../../lib/tools/schemas";
import { getAudienceSizeService } from "../../services/audience-service";

export const schema = {
  account_id: metaIdSchema,
  targeting: jsonObjectSchema,
};

export const metadata = createToolMetadata(
  "get_audience_size",
  "Estimate audience size for a Meta targeting specification.",
  true
);

export default createMetaToolHandler(getAudienceSizeService);

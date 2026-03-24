import { z } from "zod";
import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { getTargetingOptionsService } from "../../services/audience-service";

export const schema = {
  query: z.string(),
  type: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
};

export const metadata = createToolMetadata(
  "get_targeting_options",
  "Search Meta targeting options such as interests and demographics.",
  true
);

export default createMetaToolHandler(getTargetingOptionsService);

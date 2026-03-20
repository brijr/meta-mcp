import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { paginationSchema } from "../../lib/tools/schemas";
import { getAdAccountsService } from "../../services/account-service";

export const schema = {
  ...paginationSchema,
};

export const metadata = createToolMetadata(
  "get_ad_accounts",
  "List accessible Meta ad accounts for the connected workspace.",
  true
);

export default createMetaToolHandler(getAdAccountsService);

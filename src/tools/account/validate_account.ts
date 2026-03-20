import { createMetaToolHandler } from "../../lib/tools/handler";
import { createToolMetadata } from "../../lib/tools/metadata";
import { metaIdSchema } from "../../lib/tools/schemas";
import { validateAccountService } from "../../services/account-service";

export const schema = {
  account_id: metaIdSchema,
};

export const metadata = createToolMetadata(
  "validate_account",
  "Run a pre-flight validation check for an ad account.",
  true
);

export default createMetaToolHandler(validateAccountService);

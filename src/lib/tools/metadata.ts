import type { ToolMetadata } from "xmcp";

export function createToolMetadata(
  name: string,
  description: string,
  readOnlyHint: boolean
): ToolMetadata {
  return {
    name,
    description,
    annotations: {
      title: name,
      readOnlyHint,
      destructiveHint: !readOnlyHint,
      idempotentHint: readOnlyHint,
      openWorldHint: true,
    },
  };
}

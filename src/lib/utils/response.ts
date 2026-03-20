import { normalizeAppError } from "../errors";

export interface ToolResponsePayload {
  text: string;
  data?: Record<string, unknown>;
  isError?: boolean;
}

export function toolSuccess({
  text,
  data,
}: ToolResponsePayload): {
  content: [{ type: "text"; text: string }];
  structuredContent: Record<string, unknown>;
} {
  return {
    content: [{ type: "text", text }],
    structuredContent: data ?? {},
  };
}

export function toolError(error: unknown) {
  const normalized = normalizeAppError(error);
  return {
    isError: true,
    content: [{ type: "text", text: normalized.message }],
    structuredContent: {
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
      },
    },
  };
}

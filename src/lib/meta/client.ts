import { MetaApiError } from "../errors";
import { getMetaGraphVersion } from "../runtime/env";

export interface MetaPaging {
  before?: string;
  after?: string;
  next?: string;
  previous?: string;
}

interface MetaErrorEnvelope {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
    type?: string;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serializeParamValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  return JSON.stringify(value);
}

function toSearchParams(params: Record<string, unknown>): URLSearchParams {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }

    searchParams.set(key, serializeParamValue(value));
  }
  return searchParams;
}

function normalizePaging(paging: Record<string, unknown> | undefined): MetaPaging {
  const cursors = (paging?.cursors as Record<string, unknown> | undefined) ?? {};
  return {
    before: typeof cursors.before === "string" ? cursors.before : undefined,
    after: typeof cursors.after === "string" ? cursors.after : undefined,
    next: typeof paging?.next === "string" ? paging.next : undefined,
    previous: typeof paging?.previous === "string" ? paging.previous : undefined,
  };
}

export interface MetaListResult<T> {
  items: T[];
  page: MetaPaging;
}

export class MetaGraphClient {
  constructor(
    private readonly accessToken: string,
    private readonly version = getMetaGraphVersion()
  ) {}

  async get<T>(
    path: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    return this.request<T>("GET", path, { params, retryable: true });
  }

  async post<T>(
    path: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    return this.request<T>("POST", path, { params });
  }

  async postFormData<T>(path: string, formData: FormData): Promise<T> {
    return this.request<T>("POST", path, { formData });
  }

  async delete<T>(
    path: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    return this.request<T>("DELETE", path, { params });
  }

  async list<T>(
    path: string,
    params: Record<string, unknown> = {}
  ): Promise<MetaListResult<T>> {
    const response = await this.get<{
      data?: T[];
      paging?: Record<string, unknown>;
    }>(path, params);

    return {
      items: Array.isArray(response.data) ? response.data : [],
      page: normalizePaging(response.paging),
    };
  }

  private buildUrl(path: string): URL {
    const normalizedPath = path.replace(/^\/+/, "");
    return new URL(`https://graph.facebook.com/${this.version}/${normalizedPath}`);
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    options: {
      params?: Record<string, unknown>;
      formData?: FormData;
      retryable?: boolean;
    }
  ): Promise<T> {
    const url = this.buildUrl(path);
    const params = { ...(options.params ?? {}), access_token: this.accessToken };
    const maxAttempts = options.retryable ? 3 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let response: Response;
      try {
        if (method === "GET" || method === "DELETE") {
          const searchParams = toSearchParams(params);
          url.search = searchParams.toString();
          response = await fetch(url, { method });
        } else if (options.formData) {
          options.formData.set("access_token", this.accessToken);
          response = await fetch(url, { method, body: options.formData });
        } else {
          response = await fetch(url, {
            method,
            headers: {
              "content-type": "application/x-www-form-urlencoded",
            },
            body: toSearchParams(params).toString(),
          });
        }
      } catch (error) {
        if (attempt === maxAttempts) {
          throw new MetaApiError("Meta Graph API request failed.", {
            details: { path, method },
            cause: error,
          });
        }

        await sleep(150 * attempt);
        continue;
      }

      const text = await response.text();
      const parsed =
        text.length > 0
          ? (JSON.parse(text) as T & MetaErrorEnvelope)
          : ({} as T & MetaErrorEnvelope);

      if (response.ok && !parsed.error) {
        return parsed as T;
      }

      const isRetryableStatus = response.status === 429 || response.status >= 500;
      if (isRetryableStatus && attempt < maxAttempts) {
        await sleep(200 * attempt);
        continue;
      }

      const error = parsed.error;
      throw new MetaApiError(error?.message ?? "Meta Graph API returned an error.", {
        httpStatus: response.status,
        metaCode: error?.code,
        metaSubcode: error?.error_subcode,
        fbTraceId: error?.fbtrace_id,
        details: parsed,
      });
    }

    throw new MetaApiError("Meta Graph API request exhausted all retries.");
  }
}

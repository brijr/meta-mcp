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

async function computeAppSecretProof(
  accessToken: string,
  appSecret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(accessToken)
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
  private appSecretProof?: Promise<string>;

  constructor(
    private readonly accessToken: string,
    private readonly appSecret?: string,
    private readonly version = getMetaGraphVersion()
  ) {}

  private getAppSecretProof(): Promise<string> | undefined {
    if (!this.appSecret) {
      return undefined;
    }
    if (!this.appSecretProof) {
      this.appSecretProof = computeAppSecretProof(
        this.accessToken,
        this.appSecret
      );
    }
    return this.appSecretProof;
  }

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
    const proof = await this.getAppSecretProof();
    const params = {
      ...(options.params ?? {}),
      access_token: this.accessToken,
      ...(proof ? { appsecret_proof: proof } : {}),
    };
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
          if (proof) {
            options.formData.set("appsecret_proof", proof);
          }
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
      const isRetryableStatus =
        response.status === 429 || response.status >= 500;

      let parsed: (T & MetaErrorEnvelope) | undefined;
      if (text.length === 0) {
        parsed = {} as T & MetaErrorEnvelope;
      } else {
        try {
          parsed = JSON.parse(text) as T & MetaErrorEnvelope;
        } catch (parseError) {
          // Meta returned a non-JSON body — e.g. an HTML error page or a
          // form-encoded OAuth error like "error=invalid_token". Surface a
          // structured error instead of letting JSON.parse throw an uncaught
          // SyntaxError that closes the MCP connection. (#15)
          if (isRetryableStatus && attempt < maxAttempts) {
            await sleep(200 * attempt);
            continue;
          }

          const snippet =
            text.length > 500 ? `${text.slice(0, 500)}…` : text;
          throw new MetaApiError(
            `Meta Graph API returned a non-JSON response (HTTP ${response.status}).`,
            {
              httpStatus: response.status,
              details: {
                path,
                method,
                contentType: response.headers.get("content-type") ?? "",
                body: snippet,
              },
              cause: parseError,
            }
          );
        }
      }

      if (response.ok && !parsed.error) {
        return parsed as T;
      }

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

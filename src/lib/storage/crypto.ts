import { getRequiredBinding } from "../runtime/env";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
let cachedSecret: string | null = null;
let cachedKey: CryptoKey | null = null;

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(
    view.byteOffset,
    view.byteOffset + view.byteLength
  ) as ArrayBuffer;
}

async function getEncryptionKey(): Promise<CryptoKey> {
  const secret = getRequiredBinding("META_TOKEN_ENCRYPTION_KEY");
  if (cachedKey && cachedSecret === secret) {
    return cachedKey;
  }

  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  cachedSecret = secret;
  cachedKey = await crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  return cachedKey;
}

export async function encryptString(value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getEncryptionKey();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(value)
  );

  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptString(value: string): Promise<string> {
  const [ivPart, payloadPart] = value.split(".");
  if (!ivPart || !payloadPart) {
    throw new Error("Malformed encrypted token payload.");
  }

  const key = await getEncryptionKey();
  const iv = fromBase64(ivPart);
  const payload = fromBase64(payloadPart);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
    },
    key,
    toArrayBuffer(payload)
  );

  return decoder.decode(decrypted);
}

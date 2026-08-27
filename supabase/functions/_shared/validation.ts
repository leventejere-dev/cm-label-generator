/**
 * Request and response validation for the extraction endpoint.
 *
 * Server-side responsibilities (the browser does the deep normalisation):
 *   • accept only well-formed requests and plausible image bytes
 *   • verify the image really is an image, by magic bytes, not by claim
 *   • parse whatever the model returned, repairing the usual code-fence wrapper
 *   • bound the payload so a hallucinating model cannot store megabytes of JSON
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // keep in sync with env.image.hardMaxBytes
export const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

export interface ExtractRequest {
  imagePath?: string;
  imageBase64?: string;
  mimeType?: string;
  bucket?: string;
  hints?: string[];
  appVersion?: string;
}

export class RequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function parseRequest(body: unknown): ExtractRequest {
  if (typeof body !== 'object' || body === null) {
    throw new RequestError('BAD_REQUEST', 'The request body must be a JSON object.');
  }
  const input = body as Record<string, unknown>;

  const imagePath = typeof input.imagePath === 'string' ? input.imagePath.trim() : undefined;
  const imageBase64 = typeof input.imageBase64 === 'string' ? input.imageBase64 : undefined;

  if (!imagePath && !imageBase64) {
    throw new RequestError('BAD_REQUEST', 'Provide either imagePath or imageBase64.');
  }
  if (imagePath && !/^[A-Za-z0-9][A-Za-z0-9/_.-]{0,255}$/.test(imagePath)) {
    throw new RequestError('BAD_REQUEST', 'imagePath contains unexpected characters.');
  }
  if (imagePath && imagePath.includes('..')) {
    throw new RequestError('BAD_REQUEST', 'imagePath must not traverse directories.');
  }
  if (imageBase64 && imageBase64.length > MAX_IMAGE_BYTES * 1.4) {
    throw new RequestError('IMAGE_TOO_LARGE', 'The image exceeds the size limit.', 413);
  }

  const bucket = typeof input.bucket === 'string' ? input.bucket.trim() : undefined;
  if (bucket && !/^[a-z0-9][a-z0-9-]{1,62}$/.test(bucket)) {
    throw new RequestError('BAD_REQUEST', 'Invalid bucket name.');
  }

  const hints = Array.isArray(input.hints)
    ? input.hints.filter((hint): hint is string => typeof hint === 'string').slice(0, 5)
    : undefined;

  const result: ExtractRequest = {};
  if (imagePath) result.imagePath = imagePath;
  if (imageBase64) result.imageBase64 = imageBase64;
  if (typeof input.mimeType === 'string') result.mimeType = input.mimeType.toLowerCase().trim();
  if (bucket) result.bucket = bucket;
  if (hints?.length) result.hints = hints;
  if (typeof input.appVersion === 'string') result.appVersion = input.appVersion.slice(0, 64);
  return result;
}

/** Identify the image format from its magic bytes rather than trusting the caller. */
export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  const riff = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  const webp = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
  if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';
  return null;
}

export function assertImage(bytes: Uint8Array): string {
  if (bytes.byteLength === 0) {
    throw new RequestError('BAD_REQUEST', 'The image is empty.');
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new RequestError('IMAGE_TOO_LARGE', 'The image exceeds the size limit.', 413);
  }
  const mime = sniffImageMime(bytes);
  if (!mime || !ACCEPTED_MIME.includes(mime as (typeof ACCEPTED_MIME)[number])) {
    throw new RequestError(
      'UNSUPPORTED_MEDIA_TYPE',
      'Only JPEG, PNG and WebP images are accepted.',
      415,
    );
  }
  return mime;
}

/**
 * Parse the model's text answer into JSON, tolerating the two things models
 * actually do wrong: wrapping the object in a ```json fence, and adding a
 * sentence before or after it.
 */
export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    /* fall through to brace scanning */
  }

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      /* give up */
    }
  }
  throw new RequestError('AI_INVALID_JSON', 'The model did not return valid JSON.', 502);
}

const MAX_STRING = 600;
const MAX_ARRAY = 80;
const MAX_DEPTH = 8;

/**
 * Bound the payload before it is stored or returned: cap string lengths, array
 * lengths and nesting depth. Protects the database and the review UI from a
 * runaway response.
 */
export function boundPayload(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return null;
  if (typeof value === 'string') return value.length > MAX_STRING ? value.slice(0, MAX_STRING) : value;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((item) => boundPayload(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (count >= 120) break;
      out[key.slice(0, 64)] = boundPayload(item, depth + 1);
      count += 1;
    }
    return out;
  }
  return null;
}

/** Minimal shape check: is this plausibly an extraction result at all? */
export function looksLikeExtraction(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = new Set(Object.keys(value));
  return (
    keys.has('product') ||
    keys.has('quantity') ||
    keys.has('traceability') ||
    keys.has('documentType') ||
    keys.has('additionalFields')
  );
}

/** Uint8Array -> base64 without blowing the call stack on large images. */
export function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const clean = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  const binary = atob(clean.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

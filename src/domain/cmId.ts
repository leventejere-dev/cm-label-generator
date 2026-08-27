/**
 * INTERNAL COLOR METAL LABEL IDENTIFIER
 * ---------------------------------------------------------------------------
 * Format: CM-YYYYMMDD-XXXX
 *   YYYYMMDD  the date the label was generated (local time)
 *   XXXX      a 4-character suffix
 *               • server-side: a zero-padded per-day sequence (0001, 0002, ...)
 *                 produced atomically by the Postgres function next_cm_id()
 *               • client-side fallback: 4 random characters from a
 *                 human-safe alphabet (no I, L, O, U — nothing that can be
 *                 misread off a printed label or misheard on the phone)
 *
 * The scheme is encapsulated here on purpose. To change it later (site prefix,
 * check digit, longer sequence) edit this file and the SQL function; nothing
 * else in the application parses the string.
 */

/** Crockford-style base32 minus the ambiguous letters, plus digits. */
const SAFE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const CM_ID_PATTERN = /^CM-\d{8}-[0-9A-HJ-NP-TV-Z]{4}$/;

export const CM_ID_PREFIX = 'CM';

export function formatDatePart(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

function randomSuffix(length = 4): string {
  const cryptoObj = globalThis.crypto;
  const bytes = new Uint8Array(length);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += SAFE_ALPHABET[(bytes[i] ?? 0) % SAFE_ALPHABET.length];
  }
  return out;
}

/**
 * Generate a CM ID locally.
 * Used in mock mode and as a fallback when the database did not supply one.
 * When Supabase is configured the value produced by next_cm_id() wins.
 */
export function generateCmId(now: Date = new Date()): string {
  return `${CM_ID_PREFIX}-${formatDatePart(now)}-${randomSuffix()}`;
}

export function isValidCmId(value: unknown): value is string {
  return typeof value === 'string' && CM_ID_PATTERN.test(value);
}

export interface ParsedCmId {
  date: string; // YYYY-MM-DD
  suffix: string;
}

export function parseCmId(value: string): ParsedCmId | null {
  if (!isValidCmId(value)) return null;
  const [, datePart, suffix] = value.split('-') as [string, string, string];
  return {
    date: `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}`,
    suffix,
  };
}

/** Accepts whatever the database returned, guaranteeing a valid ID. */
export function coerceCmId(value: unknown, now: Date = new Date()): string {
  return isValidCmId(value) ? value : generateCmId(now);
}

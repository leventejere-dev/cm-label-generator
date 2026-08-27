/**
 * ACTIONABLE ERRORS
 * ---------------------------------------------------------------------------
 * Every failure the employee can hit is represented by an AppError carrying a
 * short title, a sentence telling them what to DO, and whether retrying makes
 * sense. The UI never shows a raw exception or an HTTP status code.
 */

export type ErrorCode =
  | 'CAMERA_PERMISSION_DENIED'
  | 'CAMERA_UNAVAILABLE'
  | 'CAMERA_INSECURE_CONTEXT'
  | 'CAPTURE_FAILED'
  | 'IMAGE_TOO_LARGE'
  | 'IMAGE_UNSUPPORTED_TYPE'
  | 'IMAGE_TOO_DARK'
  | 'IMAGE_TOO_BLURRY'
  | 'IMAGE_DECODE_FAILED'
  | 'NETWORK_FAILURE'
  | 'AI_TIMEOUT'
  | 'AI_PROVIDER_ERROR'
  | 'AI_RATE_LIMITED'
  | 'AI_INVALID_JSON'
  | 'NO_LABEL_DETECTED'
  | 'MULTIPLE_LABELS_DETECTED'
  | 'INCOMPLETE_LABEL'
  | 'UNSUPPORTED_DOCUMENT'
  | 'STORAGE_UPLOAD_FAILED'
  | 'DATABASE_FAILURE'
  | 'NOT_CONFIGURED'
  | 'NOT_FOUND'
  | 'UNKNOWN';

export interface AppErrorInit {
  code: ErrorCode;
  title: string;
  detail: string;
  retryable?: boolean;
  /** Suggests going back to the camera rather than retrying the same photo. */
  retakeAdvised?: boolean;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly title: string;
  readonly detail: string;
  readonly retryable: boolean;
  readonly retakeAdvised: boolean;

  constructor(init: AppErrorInit) {
    super(`${init.code}: ${init.title}`);
    this.name = 'AppError';
    this.code = init.code;
    this.title = init.title;
    this.detail = init.detail;
    this.retryable = init.retryable ?? false;
    this.retakeAdvised = init.retakeAdvised ?? false;
    if (init.cause !== undefined) this.cause = init.cause;
  }
}

const CATALOGUE: Record<ErrorCode, { title: string; detail: string; retryable: boolean; retakeAdvised: boolean }> = {
  CAMERA_PERMISSION_DENIED: {
    title: 'Camera access was blocked',
    detail:
      'Allow camera access for this site in your browser settings, then try again. On iPhone: Settings → Safari → Camera → Allow. On Android Chrome: tap the lock icon in the address bar → Permissions → Camera.',
    retryable: true,
    retakeAdvised: false,
  },
  CAMERA_UNAVAILABLE: {
    title: 'No camera available',
    detail:
      'This device has no usable camera, or another app is already using it. Close other camera apps, or use "Choose a photo instead".',
    retryable: true,
    retakeAdvised: false,
  },
  CAMERA_INSECURE_CONTEXT: {
    title: 'Camera needs a secure connection',
    detail:
      'Browsers only allow the camera over HTTPS. Open the app using its https:// address (localhost also works during development).',
    retryable: false,
    retakeAdvised: false,
  },
  CAPTURE_FAILED: {
    title: 'The photo could not be captured',
    detail: 'Something interrupted the camera. Try taking the photo again.',
    retryable: true,
    retakeAdvised: true,
  },
  IMAGE_TOO_LARGE: {
    title: 'The photo is too large to send',
    detail: 'Retake the photo — the app will compress it automatically. If it keeps failing, use a lower camera resolution.',
    retryable: false,
    retakeAdvised: true,
  },
  IMAGE_UNSUPPORTED_TYPE: {
    title: 'Unsupported image format',
    detail: 'Use a JPEG, PNG or WebP image. Photos taken with the in-app camera are always supported.',
    retryable: false,
    retakeAdvised: true,
  },
  IMAGE_TOO_DARK: {
    title: 'The photo is too dark to read',
    detail: 'Move closer to a light source or switch on the flash, then take the photo again.',
    retryable: false,
    retakeAdvised: true,
  },
  IMAGE_TOO_BLURRY: {
    title: 'The photo looks blurred',
    detail: 'Hold the phone still, let the camera focus on the text, and take the photo again.',
    retryable: false,
    retakeAdvised: true,
  },
  IMAGE_DECODE_FAILED: {
    title: 'The photo could not be processed',
    detail: 'The image file appears to be damaged. Please take the photo again.',
    retryable: false,
    retakeAdvised: true,
  },
  NETWORK_FAILURE: {
    title: 'No connection to the server',
    detail: 'Check the phone’s internet connection and press Retry. Your photo has not been lost.',
    retryable: true,
    retakeAdvised: false,
  },
  AI_TIMEOUT: {
    title: 'The analysis took too long',
    detail: 'The service did not answer in time. Press Retry — if it happens again, retake the photo closer to the label.',
    retryable: true,
    retakeAdvised: false,
  },
  AI_PROVIDER_ERROR: {
    title: 'The analysis service failed',
    detail: 'The document analysis service returned an error. Press Retry in a moment, or enter the values manually.',
    retryable: true,
    retakeAdvised: false,
  },
  AI_RATE_LIMITED: {
    title: 'Too many scans in a short time',
    detail: 'Wait about a minute and press Retry.',
    retryable: true,
    retakeAdvised: false,
  },
  AI_INVALID_JSON: {
    title: 'The analysis result could not be read',
    detail:
      'The service answered in an unexpected format. Nothing was filled in automatically — press Retry, or enter the values manually on the review screen.',
    retryable: true,
    retakeAdvised: false,
  },
  NO_LABEL_DETECTED: {
    title: 'No label found in the photo',
    detail: 'Place the whole supplier label inside the frame, fill the frame with it, and take the photo again.',
    retryable: false,
    retakeAdvised: true,
  },
  MULTIPLE_LABELS_DETECTED: {
    title: 'More than one label in the photo',
    detail: 'Photograph one label at a time so the values cannot be mixed up.',
    retryable: false,
    retakeAdvised: true,
  },
  INCOMPLETE_LABEL: {
    title: 'Part of the label is missing',
    detail: 'Some text could not be read. Move closer to the label, make sure all four edges are inside the frame, and retake the photo.',
    retryable: false,
    retakeAdvised: true,
  },
  UNSUPPORTED_DOCUMENT: {
    title: 'This does not look like a material label',
    detail: 'Photograph the printed material label attached to the package.',
    retryable: false,
    retakeAdvised: true,
  },
  STORAGE_UPLOAD_FAILED: {
    title: 'The photo could not be uploaded',
    detail: 'Check the connection and press Retry. If it keeps failing, the storage bucket may not be configured yet.',
    retryable: true,
    retakeAdvised: false,
  },
  DATABASE_FAILURE: {
    title: 'The label could not be saved',
    detail: 'The database rejected the request. The label is still on screen — you can print it, but it will not appear under Recent Labels.',
    retryable: true,
    retakeAdvised: false,
  },
  NOT_CONFIGURED: {
    title: 'Label reading is not switched on yet',
    detail:
      'The app is installed and working, but the image-reading service still has to be activated by whoever administers it. Nothing you did is wrong — please pass this message on and try again afterwards.',
    retryable: false,
    retakeAdvised: false,
  },
  NOT_FOUND: {
    title: 'Label not found',
    detail: 'This label no longer exists. Go back to Recent Labels and pick another one.',
    retryable: false,
    retakeAdvised: false,
  },
  UNKNOWN: {
    title: 'Something went wrong',
    detail: 'An unexpected problem occurred. Press Retry — if it continues, take the photo again.',
    retryable: true,
    retakeAdvised: false,
  },
};

/** Build an AppError from a code, optionally overriding the wording. */
export function appError(
  code: ErrorCode,
  overrides: Partial<Omit<AppErrorInit, 'code'>> = {},
): AppError {
  const base = CATALOGUE[code];
  return new AppError({
    code,
    title: overrides.title ?? base.title,
    detail: overrides.detail ?? base.detail,
    retryable: overrides.retryable ?? base.retryable,
    retakeAdvised: overrides.retakeAdvised ?? base.retakeAdvised,
    cause: overrides.cause,
  });
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Last-resort conversion of anything thrown into a presentable AppError. */
export function toAppError(value: unknown): AppError {
  if (isAppError(value)) return value;
  if (value instanceof DOMException) {
    if (value.name === 'NotAllowedError' || value.name === 'SecurityError') {
      return appError('CAMERA_PERMISSION_DENIED', { cause: value });
    }
    if (value.name === 'NotFoundError' || value.name === 'OverconstrainedError') {
      return appError('CAMERA_UNAVAILABLE', { cause: value });
    }
    if (value.name === 'NotReadableError' || value.name === 'AbortError') {
      return appError('CAMERA_UNAVAILABLE', { cause: value });
    }
  }
  if (value instanceof TypeError && /fetch|network/i.test(value.message)) {
    return appError('NETWORK_FAILURE', { cause: value });
  }
  return appError('UNKNOWN', { cause: value });
}

/** Map a warning code returned by the extraction service to an error code. */
export function errorCodeForWarning(code: string): ErrorCode | null {
  switch (code) {
    case 'NO_LABEL_DETECTED':
      return 'NO_LABEL_DETECTED';
    case 'MULTIPLE_LABELS_DETECTED':
      return 'MULTIPLE_LABELS_DETECTED';
    case 'INCOMPLETE_LABEL':
    case 'TEXT_UNREADABLE':
      return 'INCOMPLETE_LABEL';
    case 'UNSUPPORTED_DOCUMENT':
      return 'UNSUPPORTED_DOCUMENT';
    default:
      return null;
  }
}

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
  | 'AI_DAILY_LIMIT'
  | 'AI_BUSY'
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
    title: 'Accesul la camera foto este blocat',
    detail:
      'Permite accesul la camera foto pentru acest site din setările browserului, apoi încearcă din nou. Pe iPhone: Setări → Safari → Cameră → Permite. Pe Android Chrome: atinge pictograma lacăt din bara de adrese → Permisiuni → Cameră.',
    retryable: true,
    retakeAdvised: false,
  },
  CAMERA_UNAVAILABLE: {
    title: 'Nicio cameră foto disponibilă',
    detail:
      'Acest dispozitiv nu are o cameră foto utilizabilă sau o folosește deja altă aplicație. Închide celelalte aplicații care folosesc camera sau folosește „Alege o fotografie existentă”.',
    retryable: true,
    retakeAdvised: false,
  },
  CAMERA_INSECURE_CONTEXT: {
    title: 'Camera foto are nevoie de o conexiune securizată',
    detail:
      'Browserele permit accesul la camera foto doar prin HTTPS. Deschide aplicația folosind adresa ei https:// (în timpul dezvoltării funcționează și localhost).',
    retryable: false,
    retakeAdvised: false,
  },
  CAPTURE_FAILED: {
    title: 'Fotografia nu a putut fi făcută',
    detail: 'Ceva a întrerupt camera foto. Fă din nou fotografia.',
    retryable: true,
    retakeAdvised: true,
  },
  IMAGE_TOO_LARGE: {
    title: 'Fotografia este prea mare pentru a fi trimisă',
    detail: 'Refă fotografia — aplicația o comprimă automat. Dacă tot nu merge, folosește o rezoluție mai mică la camera foto.',
    retryable: false,
    retakeAdvised: true,
  },
  IMAGE_UNSUPPORTED_TYPE: {
    title: 'Format de imagine neacceptat',
    detail: 'Folosește o imagine JPEG, PNG sau WebP. Fotografiile făcute cu camera din aplicație sunt întotdeauna acceptate.',
    retryable: false,
    retakeAdvised: true,
  },
  IMAGE_TOO_DARK: {
    title: 'Fotografia este prea întunecată ca să poată fi citită',
    detail: 'Apropie-te de o sursă de lumină sau pornește blițul, apoi fă din nou fotografia.',
    retryable: false,
    retakeAdvised: true,
  },
  IMAGE_TOO_BLURRY: {
    title: 'Fotografia pare neclară',
    detail: 'Ține telefonul nemișcat, lasă camera foto să focalizeze pe text și fă din nou fotografia.',
    retryable: false,
    retakeAdvised: true,
  },
  IMAGE_DECODE_FAILED: {
    title: 'Fotografia nu a putut fi procesată',
    detail: 'Fișierul imagine pare deteriorat. Fă din nou fotografia.',
    retryable: false,
    retakeAdvised: true,
  },
  NETWORK_FAILURE: {
    title: 'Fără conexiune la server',
    detail: 'Verifică conexiunea la internet a telefonului și apasă Reîncearcă. Fotografia nu s-a pierdut.',
    retryable: true,
    retakeAdvised: false,
  },
  AI_TIMEOUT: {
    title: 'Analiza a durat prea mult',
    detail: 'Serviciul nu a răspuns la timp. Apasă Reîncearcă — dacă se repetă, refă fotografia mai aproape de etichetă.',
    retryable: true,
    retakeAdvised: false,
  },
  AI_PROVIDER_ERROR: {
    title: 'Serviciul de analiză nu a funcționat',
    detail: 'Serviciul care analizează documentele a returnat o eroare. Apasă Reîncearcă peste un moment sau completează valorile manual.',
    retryable: true,
    retakeAdvised: false,
  },
  AI_RATE_LIMITED: {
    title: 'Prea multe scanări într-un timp scurt',
    detail: 'Așteaptă aproximativ un minut și apasă Reîncearcă.',
    retryable: true,
    retakeAdvised: false,
  },
  AI_INVALID_JSON: {
    title: 'Rezultatul analizei nu a putut fi citit',
    detail:
      'Serviciul a răspuns într-un format neașteptat. Nu s-a completat nimic automat — apasă Reîncearcă sau completează valorile manual pe ecranul de verificare.',
    retryable: true,
    retakeAdvised: false,
  },
  NO_LABEL_DETECTED: {
    title: 'Nicio etichetă găsită în fotografie',
    detail: 'Încadrează toată eticheta furnizorului și apropie-te până umple cadrul, apoi fă din nou fotografia.',
    retryable: false,
    retakeAdvised: true,
  },
  MULTIPLE_LABELS_DETECTED: {
    title: 'Mai multe etichete în fotografie',
    detail: 'Fotografiază câte o singură etichetă, ca să nu se amestece valorile.',
    retryable: false,
    retakeAdvised: true,
  },
  INCOMPLETE_LABEL: {
    title: 'Lipsește o parte din etichetă',
    detail: 'O parte din text nu a putut fi citită. Apropie-te de etichetă, ai grijă ca toate cele patru margini să fie în cadru și refă fotografia.',
    retryable: false,
    retakeAdvised: true,
  },
  UNSUPPORTED_DOCUMENT: {
    title: 'Nu pare a fi o etichetă de material',
    detail: 'Fotografiază eticheta de material tipărită, lipită pe pachet.',
    retryable: false,
    retakeAdvised: true,
  },
  STORAGE_UPLOAD_FAILED: {
    title: 'Fotografia nu a putut fi încărcată',
    detail: 'Verifică conexiunea și apasă Reîncearcă. Dacă tot nu merge, se poate ca spațiul de stocare să nu fie încă configurat.',
    retryable: true,
    retakeAdvised: false,
  },
  DATABASE_FAILURE: {
    title: 'Eticheta nu a putut fi salvată',
    detail: 'Baza de date a respins cererea. Eticheta este în continuare pe ecran — o poți tipări, dar nu va apărea în Etichete recente.',
    retryable: true,
    retakeAdvised: false,
  },
  AI_BUSY: {
    title: 'Serviciul de citire este ocupat acum',
    detail:
      'Prea multă lume folosește în acest moment serviciul gratuit de citire. Apasă „Reîncearcă analiza” peste un minut — fotografia ta nu s-a pierdut.',
    retryable: true,
    retakeAdvised: false,
  },
  AI_DAILY_LIMIT: {
    title: 'S-au terminat citirile gratuite de etichete pe ziua de azi',
    detail:
      'Numărul de citiri gratuite de etichete pe zi s-a epuizat. Se reînnoiește automat peste noapte — până atunci poți completa câmpurile de mână și tipări eticheta ca de obicei.',
    retryable: false,
    retakeAdvised: false,
  },
  NOT_CONFIGURED: {
    title: 'Citirea etichetelor nu este încă activată',
    detail:
      'Aplicația este instalată și funcționează, dar serviciul care citește fotografiile trebuie mai întâi activat de cine administrează aplicația. Nu ai greșit cu nimic — transmite mai departe acest mesaj și încearcă din nou după aceea.',
    retryable: false,
    retakeAdvised: false,
  },
  NOT_FOUND: {
    title: 'Eticheta nu a fost găsită',
    detail: 'Această etichetă nu mai există. Întoarce-te la Etichete recente și alege alta.',
    retryable: false,
    retakeAdvised: false,
  },
  UNKNOWN: {
    title: 'Ceva nu a mers bine',
    detail: 'A apărut o problemă neașteptată. Apasă Reîncearcă — dacă se repetă, fă din nou fotografia.',
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

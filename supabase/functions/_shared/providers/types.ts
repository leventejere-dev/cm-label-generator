/**
 * LabelExtractionProvider — the server-side vendor abstraction.
 *
 * Everything vendor-specific lives behind this interface. Adding a provider
 * means writing one file and registering it in ./index.ts; nothing else in the
 * function, and nothing at all in the frontend, changes.
 */

export interface ExtractionInput {
  imageBase64: string;
  mimeType: string;
  systemPrompt: string;
  userInstruction: string;
  /** Optional supplier-specific hints (reserved for a future feature). */
  hints?: string[];
  signal?: AbortSignal;
}

export interface ExtractionOutput {
  /** Parsed JSON exactly as the model produced it. */
  data: unknown;
  /** Diagnostics kept for troubleshooting (token counts, stop reason, ...). */
  raw: unknown;
  model: string;
}

export interface LabelExtractionProvider {
  readonly id: string;
  readonly model: string;
  extract(input: ExtractionInput): Promise<ExtractionOutput>;
}

export class ProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

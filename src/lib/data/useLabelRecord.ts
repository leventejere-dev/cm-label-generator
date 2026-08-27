/** Load a persisted label (and a displayable URL for its source photo). */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { LabelRecord } from '../../domain/labelRecord';
import { appError, toAppError, type AppError } from '../errors';
import { getRepository } from './repository';

export interface UseLabelRecordResult {
  record: LabelRecord | null;
  sourceImageUrl: string | null;
  loading: boolean;
  error: AppError | null;
  reload: () => void;
}

export function useLabelRecord(id: string | undefined, skip = false): UseLabelRecordResult {
  const [record, setRecord] = useState<LabelRecord | null>(null);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!skip && Boolean(id));
  const [error, setError] = useState<AppError | null>(null);
  const [nonce, setNonce] = useState(0);
  const ownedUrl = useRef<string | null>(null);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (skip || !id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const repository = await getRepository();
        const found = await repository.get(id);
        if (cancelled) return;
        if (!found) {
          setError(appError('NOT_FOUND'));
          setRecord(null);
          return;
        }
        setRecord(found);

        if (found.sourceImagePath) {
          const url = await repository.getSourceImageUrl(found.sourceImagePath);
          if (cancelled) {
            if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
            return;
          }
          if (url?.startsWith('blob:')) ownedUrl.current = url;
          setSourceImageUrl(url);
        }
      } catch (cause) {
        if (!cancelled) setError(toAppError(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, skip, nonce]);

  useEffect(
    () => () => {
      if (ownedUrl.current) URL.revokeObjectURL(ownedUrl.current);
    },
    [],
  );

  return { record, sourceImageUrl, loading, error, reload };
}

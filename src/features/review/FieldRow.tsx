import { useState } from 'react';
import { Badge, ConfidenceBadge } from '../../components/ui/Badge';
import { IconTrash } from '../../components/ui/Icons';
import { needsReview, type FieldValue } from '../../domain/extraction';

export interface FieldRowProps {
  id: string;
  label: string;
  field: FieldValue | null;
  edited: boolean;
  hint?: string;
  /** Custom fields can be renamed and removed. */
  renameable?: boolean;
  onChangeValue: (value: string) => void;
  onChangeLabel?: (label: string) => void;
  onRemove?: () => void;
  error?: string | null;
}

export function FieldRow({
  id,
  label,
  field,
  edited,
  hint,
  renameable = false,
  onChangeValue,
  onChangeLabel,
  onRemove,
  error,
}: FieldRowProps) {
  const [showSource, setShowSource] = useState(false);
  const confidence = field?.confidence ?? null;
  const attention = !edited && needsReview(confidence);
  const low = !edited && confidence !== null && confidence < 0.7;

  const classes = ['field', attention ? 'field--attention' : '', low ? 'field--low' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <div className="field__head">
        {renameable && onChangeLabel ? (
          <input
            className="field__label"
            style={{
              border: '1px solid var(--cm-border)',
              borderRadius: 4,
              padding: '2px 6px',
              background: 'var(--cm-surface)',
              maxWidth: 200,
            }}
            value={label}
            aria-label="Field name"
            onChange={(event) => onChangeLabel(event.target.value)}
          />
        ) : (
          <label className="field__label" htmlFor={id}>
            {label}
          </label>
        )}

        <div className="field__actions">
          {edited ? (
            <Badge tone="accent">Edited</Badge>
          ) : field ? (
            <ConfidenceBadge confidence={confidence} />
          ) : (
            <Badge tone="neutral">Empty</Badge>
          )}
          {onRemove ? (
            <button type="button" className="icon-btn" onClick={onRemove} aria-label={`Remove ${label}`}>
              <IconTrash size={15} />
            </button>
          ) : null}
        </div>
      </div>

      <input
        id={id}
        className="field__input"
        value={field?.value ?? ''}
        placeholder={hint ?? 'Not on the label'}
        inputMode="text"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(event) => onChangeValue(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />

      {error ? (
        <p id={`${id}-error`} style={{ marginTop: 6, color: 'var(--cm-danger)', fontSize: 'var(--cm-text-xs)' }}>
          {error}
        </p>
      ) : null}

      {field?.sourceText ? (
        <>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ minHeight: 28, padding: '0 6px', marginTop: 4, fontSize: 'var(--cm-text-xs)' }}
            onClick={() => setShowSource((value) => !value)}
          >
            {showSource ? 'Hide source text' : 'Show source text'}
          </button>
          {showSource ? <p className="field__source">“{field.sourceText}”</p> : null}
        </>
      ) : null}
    </div>
  );
}

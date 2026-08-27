/**
 * The editable review form.
 * Every extracted value is editable; low- and medium-confidence values are
 * visually highlighted; custom fields can be added, renamed and removed —
 * subject to the supplier guards.
 */

import { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { IconPlus } from '../../components/ui/Icons';
import {
  confidenceBand,
  type ExtractionResult,
  type FieldMap,
} from '../../domain/extraction';
import {
  DELIVERY_GROUP_NOTE,
  FIELD_GROUPS,
  GROUP_TITLES,
  fieldsInGroup,
  type FieldGroupId,
} from '../../domain/fields';
import type { RemovedItem } from '../../domain/sanitize';
import { FieldRow } from './FieldRow';
import { checkCaption, checkValue } from './guards';
import {
  addAdditional,
  clearStandardField,
  ensureStandardField,
  removeAdditional,
  setAdditionalLabel,
  setAdditionalValue,
  setStandardField,
} from './operations';

export interface ReviewFormProps {
  data: ExtractionResult;
  removed: RemovedItem[];
  onChange: (data: ExtractionResult) => void;
}

export function ReviewForm({ data, removed, onChange }: ReviewFormProps) {
  const [edited, setEdited] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const markEdited = (id: string) => {
    setEdited((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  };

  const setError = (id: string, message: string | null) => {
    setErrors((current) => {
      if (!message) {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      }
      return { ...current, [id]: message };
    });
  };

  const handleStandardChange = (group: FieldGroupId, key: string, value: string) => {
    const id = `${group}.${key}`;
    const verdict = checkValue(value, removed);
    setError(id, verdict.ok ? null : verdict.message ?? 'Această valoare nu poate fi folosită.');
    markEdited(id);
    onChange(setStandardField(data, group, key, value));
  };

  const handleAdditionalChange = (index: number, value: string) => {
    const field = data.additionalFields[index];
    if (!field) return;
    const id = `additional.${field.key}`;
    const verdict = checkValue(value, removed);
    setError(id, verdict.ok ? null : verdict.message ?? 'Această valoare nu poate fi folosită.');
    markEdited(id);
    onChange(setAdditionalValue(data, index, value));
  };

  const handleAdditionalLabel = (index: number, label: string) => {
    const field = data.additionalFields[index];
    if (!field) return;
    const id = `additional.${field.key}.label`;
    const verdict = checkCaption(label);
    setError(id, verdict.ok ? null : verdict.message ?? 'Acest nume de câmp nu poate fi folosit.');
    onChange(setAdditionalLabel(data, index, label));
  };

  const lowConfidenceCount = useMemo(() => {
    let count = 0;
    for (const group of FIELD_GROUPS) {
      for (const [key, field] of Object.entries(data[group] as FieldMap)) {
        if (!field) continue;
        if (edited.has(`${group}.${key}`)) continue;
        const band = confidenceBand(field.confidence);
        if (band === 'low' || band === 'medium') count += 1;
      }
    }
    for (const field of data.additionalFields) {
      if (edited.has(`additional.${field.key}`)) continue;
      const band = confidenceBand(field.confidence);
      if (band === 'low' || band === 'medium') count += 1;
    }
    return count;
  }, [data, edited]);

  return (
    <div className="stack">
      {lowConfidenceCount > 0 ? (
        <Card padded>
          <strong>Verifică câmpurile evidențiate înainte de a genera eticheta.</strong>
          <p className="muted" style={{ marginTop: 4, fontSize: 'var(--cm-text-sm)' }}>
            {lowConfidenceCount}{' '}
            {lowConfidenceCount === 1
              ? 'valoare nu a putut fi citită'
              : `${lowConfidenceCount >= 20 ? 'de valori' : 'valori'} nu au putut fi citite`}{' '}
            cu încredere mare. Compară-le cu fotografia.
          </p>
        </Card>
      ) : null}

      {FIELD_GROUPS.map((group) => (
        <GroupCard
          key={group}
          group={group}
          data={data}
          edited={edited}
          errors={errors}
          onStandardChange={handleStandardChange}
          onStandardClear={(key) => onChange(clearStandardField(data, group, key))}
          onStandardAdd={(key) => onChange(ensureStandardField(data, group, key))}
          onAdditionalChange={handleAdditionalChange}
          onAdditionalLabel={handleAdditionalLabel}
          onAdditionalRemove={(index) => onChange(removeAdditional(data, index))}
          onAdditionalAdd={(label, targetGroup) => {
            const verdict = checkCaption(label);
            if (!verdict.ok) {
              setError('new-field', verdict.message ?? 'Acest nume de câmp nu poate fi folosit.');
              return false;
            }
            setError('new-field', null);
            onChange(addAdditional(data, label, targetGroup).data);
            return true;
          }}
          newFieldError={errors['new-field'] ?? null}
        />
      ))}

      <AdditionalOnlyCard
        data={data}
        edited={edited}
        errors={errors}
        onAdditionalChange={handleAdditionalChange}
        onAdditionalLabel={handleAdditionalLabel}
        onAdditionalRemove={(index) => onChange(removeAdditional(data, index))}
        onAdditionalAdd={(label) => {
          const verdict = checkCaption(label);
          if (!verdict.ok) {
            setError('new-field', verdict.message ?? 'Acest nume de câmp nu poate fi folosit.');
            return false;
          }
          setError('new-field', null);
          onChange(addAdditional(data, label, 'additional').data);
          return true;
        }}
        newFieldError={errors['new-field'] ?? null}
      />
    </div>
  );
}

interface GroupCardProps {
  group: FieldGroupId;
  data: ExtractionResult;
  edited: Set<string>;
  errors: Record<string, string>;
  onStandardChange: (group: FieldGroupId, key: string, value: string) => void;
  onStandardClear: (key: string) => void;
  onStandardAdd: (key: string) => void;
  onAdditionalChange: (index: number, value: string) => void;
  onAdditionalLabel: (index: number, label: string) => void;
  onAdditionalRemove: (index: number) => void;
  onAdditionalAdd: (label: string, group: FieldGroupId | 'additional') => boolean;
  newFieldError: string | null;
}

function GroupCard(props: GroupCardProps) {
  const { group, data, edited, errors } = props;
  const map = data[group] as FieldMap;

  // The delivery block is ours to fill in, so its inputs are always shown.
  const alwaysShowAll = group === 'delivery';
  const populated = alwaysShowAll
    ? fieldsInGroup(group)
    : fieldsInGroup(group).filter((field) => map[field.key] !== null);
  const empty = alwaysShowAll ? [] : fieldsInGroup(group).filter((field) => map[field.key] === null);
  const extras = data.additionalFields
    .map((field, index) => ({ field, index }))
    .filter((entry) => entry.field.group === group);

  const [selected, setSelected] = useState('');

  if (populated.length === 0 && extras.length === 0 && group !== 'product' && !alwaysShowAll) {
    // Keep the form short: a completely empty group is offered as a compact
    // "add" control rather than a wall of blank inputs.
    return (
      <Card padded={false} flush>
        <div className="group-card__header">{GROUP_TITLES[group]}</div>
        <div style={{ padding: 'var(--cm-space-4)' }}>
          <AddStandardField
            options={empty.map((field) => ({ key: field.key, label: field.label }))}
            value={selected}
            onSelect={setSelected}
            onAdd={() => {
              if (!selected) return;
              props.onStandardAdd(selected);
              setSelected('');
            }}
          />
        </div>
      </Card>
    );
  }

  return (
    <Card padded={false} flush>
      <div className="group-card__header">
        {GROUP_TITLES[group]}
        <span style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }}>
          <Badge tone={group === 'delivery' ? 'accent' : 'neutral'}>
            {group === 'delivery' ? 'Datele tale' : populated.length + extras.length}
          </Badge>
        </span>
      </div>

      {group === 'delivery' ? (
        <p
          className="muted"
          style={{
            padding: 'var(--cm-space-3) var(--cm-space-4) 0',
            fontSize: 'var(--cm-text-sm)',
          }}
        >
          {DELIVERY_GROUP_NOTE}
        </p>
      ) : null}

      <div className="group-card__body">
        {populated.map((descriptor) => (
          <FieldRow
            key={descriptor.key}
            id={`${group}.${descriptor.key}`}
            label={descriptor.label}
            hint={descriptor.hint}
            field={map[descriptor.key] ?? null}
            edited={edited.has(`${group}.${descriptor.key}`)}
            error={errors[`${group}.${descriptor.key}`] ?? null}
            onChangeValue={(value) => props.onStandardChange(group, descriptor.key, value)}
            onRemove={() => props.onStandardClear(descriptor.key)}
          />
        ))}

        {extras.map(({ field, index }) => (
          <FieldRow
            key={field.key}
            id={`additional.${field.key}`}
            label={field.label}
            field={{ value: field.value, confidence: field.confidence, sourceText: field.sourceText }}
            edited={edited.has(`additional.${field.key}`)}
            renameable
            error={
              errors[`additional.${field.key}`] ?? errors[`additional.${field.key}.label`] ?? null
            }
            onChangeValue={(value) => props.onAdditionalChange(index, value)}
            onChangeLabel={(label) => props.onAdditionalLabel(index, label)}
            onRemove={() => props.onAdditionalRemove(index)}
          />
        ))}
      </div>

      <div style={{ padding: 'var(--cm-space-4)', borderTop: '1px solid var(--cm-border)' }}>
        <AddStandardField
          options={empty.map((field) => ({ key: field.key, label: field.label }))}
          value={selected}
          onSelect={setSelected}
          onAdd={() => {
            if (!selected) return;
            props.onStandardAdd(selected);
            setSelected('');
          }}
        />
      </div>
    </Card>
  );
}

function AddStandardField({
  options,
  value,
  onSelect,
  onAdd,
}: {
  options: Array<{ key: string; label: string }>;
  value: string;
  onSelect: (value: string) => void;
  onAdd: () => void;
}) {
  if (options.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 'var(--cm-space-2)' }}>
      <select
        className="field__input"
        value={value}
        aria-label="Adaugă un câmp standard"
        onChange={(event) => onSelect(event.target.value)}
        style={{ flex: 1 }}
      >
        <option value="">Adaugă un câmp…</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
      <Button variant="secondary" icon={<IconPlus size={16} />} onClick={onAdd} disabled={!value}>
        Adaugă
      </Button>
    </div>
  );
}

function AdditionalOnlyCard({
  data,
  edited,
  errors,
  onAdditionalChange,
  onAdditionalLabel,
  onAdditionalRemove,
  onAdditionalAdd,
  newFieldError,
}: {
  data: ExtractionResult;
  edited: Set<string>;
  errors: Record<string, string>;
  onAdditionalChange: (index: number, value: string) => void;
  onAdditionalLabel: (index: number, label: string) => void;
  onAdditionalRemove: (index: number) => void;
  onAdditionalAdd: (label: string) => boolean;
  newFieldError: string | null;
}) {
  const [draft, setDraft] = useState('');
  const extras = data.additionalFields
    .map((field, index) => ({ field, index }))
    .filter((entry) => entry.field.group === 'additional');

  return (
    <Card padded={false} flush>
      <div className="group-card__header">Informații suplimentare</div>
      <div className="group-card__body">
        {extras.length === 0 ? (
          <p className="muted" style={{ padding: 'var(--cm-space-4) 0', fontSize: 'var(--cm-text-sm)' }}>
            Aici apare tot ce a tipărit furnizorul și nu se potrivește într-un câmp standard.
          </p>
        ) : null}

        {extras.map(({ field, index }) => (
          <FieldRow
            key={field.key}
            id={`additional.${field.key}`}
            label={field.label}
            field={{ value: field.value, confidence: field.confidence, sourceText: field.sourceText }}
            edited={edited.has(`additional.${field.key}`)}
            renameable
            error={errors[`additional.${field.key}`] ?? errors[`additional.${field.key}.label`] ?? null}
            onChangeValue={(value) => onAdditionalChange(index, value)}
            onChangeLabel={(label) => onAdditionalLabel(index, label)}
            onRemove={() => onAdditionalRemove(index)}
          />
        ))}
      </div>

      <div style={{ padding: 'var(--cm-space-4)', borderTop: '1px solid var(--cm-border)' }}>
        <div style={{ display: 'flex', gap: 'var(--cm-space-2)' }}>
          <input
            className="field__input"
            style={{ flex: 1 }}
            placeholder="Numele câmpului nou"
            aria-label="Numele câmpului nou"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button
            variant="secondary"
            icon={<IconPlus size={16} />}
            disabled={draft.trim().length === 0}
            onClick={() => {
              if (onAdditionalAdd(draft)) setDraft('');
            }}
          >
            Adaugă
          </Button>
        </div>
        {newFieldError ? (
          <p style={{ marginTop: 8, color: 'var(--cm-danger)', fontSize: 'var(--cm-text-xs)' }}>
            {newFieldError}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

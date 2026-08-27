-- ===========================================================================
-- CM Label Generator — initial schema
-- ===========================================================================
-- Run with:  supabase db push        (or paste into the SQL editor)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Human-readable Color Metal label identifier: CM-YYYYMMDD-NNNN
-- ---------------------------------------------------------------------------
-- Kept in the database so the sequence is atomic across devices. The scheme is
-- encapsulated in this one function plus src/domain/cmId.ts; nothing else in
-- the application parses the string.

create table if not exists public.cm_id_counters (
  day         date primary key,
  last_value  integer not null default 0
);

comment on table public.cm_id_counters is
  'Per-day counter backing next_cm_id(). One row per calendar day (Europe/Bucharest).';

create or replace function public.next_cm_id()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day  date;
  v_next integer;
begin
  v_day := (now() at time zone 'Europe/Bucharest')::date;

  insert into public.cm_id_counters as c (day, last_value)
       values (v_day, 1)
  on conflict (day) do update
          set last_value = c.last_value + 1
    returning c.last_value into v_next;

  -- Wraps after 9 999 labels in one day, which is far beyond real throughput.
  return 'CM-' || to_char(v_day, 'YYYYMMDD') || '-' || lpad((v_next % 10000)::text, 4, '0');
end;
$$;

comment on function public.next_cm_id() is
  'Returns the next human-readable label id for today, e.g. CM-20260826-0007.';

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- labels
-- ---------------------------------------------------------------------------
-- Deliberately one wide table with JSONB payloads rather than a normalised
-- field model: supplier labels are not standardized, the field set changes with
-- every new supplier, and every query this application makes is "give me this
-- label" or "give me the last N labels".

create table if not exists public.labels (
  id                        uuid primary key default gen_random_uuid(),
  cm_id                     text not null unique default public.next_cm_id(),

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  status                    text not null default 'draft'
                              check (status in ('draft','extracted','reviewed','generated','failed')),

  -- Source photograph (private bucket; see the storage migration)
  source_image_path         text,
  source_image_mime         text,
  source_image_bytes        integer check (source_image_bytes is null or source_image_bytes >= 0),

  -- AI payloads
  raw_ai_response           jsonb,
  structured_extracted_data jsonb,
  reviewed_data             jsonb,
  removed_sensitive_data    jsonb not null default '[]'::jsonb,

  ai_provider               text,
  ai_model                  text,
  processing_duration_ms    integer check (processing_duration_ms is null or processing_duration_ms >= 0),
  overall_confidence        numeric(4,3) check (overall_confidence is null
                                                or (overall_confidence >= 0 and overall_confidence <= 1)),
  generated_label_version   text not null default 'cm-a4-v1',

  -- Denormalised columns so the history list needs no JSONB traversal
  summary_product           text,
  summary_dimensions        text,
  summary_weight            text,

  warnings                  jsonb not null default '[]'::jsonb,
  app_version               text
);

comment on table public.labels is
  'One row per scanned supplier label. reviewed_data is what gets printed; removed_sensitive_data is internal only and must never be rendered on a customer-facing label.';
comment on column public.labels.removed_sensitive_data is
  'Supplier-identifying information excluded from the generated label. Internal verification only.';
comment on column public.labels.raw_ai_response is
  'Untouched provider payload, kept for troubleshooting extraction quality.';

create index if not exists labels_created_at_idx on public.labels (created_at desc);
create index if not exists labels_status_idx     on public.labels (status);
create index if not exists labels_cm_id_idx      on public.labels (cm_id);

drop trigger if exists labels_set_updated_at on public.labels;
create trigger labels_set_updated_at
  before update on public.labels
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Rate limiting for the Edge Function
-- ---------------------------------------------------------------------------
-- Written only by the Edge Function (service role). Not readable by clients.

create table if not exists public.extraction_rate_events (
  id         bigserial primary key,
  client_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists extraction_rate_events_lookup_idx
  on public.extraction_rate_events (client_key, created_at desc);

comment on table public.extraction_rate_events is
  'Sliding-window rate limiting for extract-label. Rows older than an hour can be deleted freely.';

-- ===========================================================================
-- ROW LEVEL SECURITY
-- ===========================================================================
-- TRADE-OFF, MADE DELIBERATELY AND DOCUMENTED (README §19 / §39):
--
-- The MVP ships without authentication so an employee can open a URL and scan.
-- RLS is therefore ENABLED with permissive policies for the `anon` role, which
-- means anyone holding the (public) anon key can read and write labels. That is
-- acceptable ONLY because:
--   • the app holds no personal data and no supplier identity is exposed to
--     customers by the tool itself,
--   • the URL is shared internally,
--   • DELETE is not granted to anyone — data cannot be destroyed from the app,
--   • the AI credentials live in Edge Function secrets, never in the browser.
--
-- TO LOCK THIS DOWN (recommended before wider rollout): enable Supabase Auth,
-- then replace `to anon, authenticated` with `to authenticated` in the policies
-- below and re-run. The frontend needs no change beyond adding a login screen.
-- ===========================================================================

alter table public.labels enable row level security;
alter table public.cm_id_counters enable row level security;
alter table public.extraction_rate_events enable row level security;

drop policy if exists labels_read   on public.labels;
drop policy if exists labels_insert on public.labels;
drop policy if exists labels_update on public.labels;

create policy labels_read
  on public.labels for select
  to anon, authenticated
  using (true);

create policy labels_insert
  on public.labels for insert
  to anon, authenticated
  with check (true);

create policy labels_update
  on public.labels for update
  to anon, authenticated
  using (true)
  with check (true);

-- No DELETE policy anywhere: labels cannot be removed through the API.
revoke delete on public.labels from anon, authenticated;

-- Counters and rate-limit events are service-role only (no policies at all,
-- and RLS on means every anon/authenticated query returns nothing).
revoke all on public.cm_id_counters        from anon, authenticated;
revoke all on public.extraction_rate_events from anon, authenticated;

-- next_cm_id() is SECURITY DEFINER, so the default on insert still works.
grant execute on function public.next_cm_id() to anon, authenticated;

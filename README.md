# CM Label Generator

Photograph a supplier's material label with your phone. Get back a clean, standardized
**Color Metal A5 label** (148 × 210 mm — half an A4 sheet) that keeps the product data and
removes every trace of where the material was bought.

```
SUPPLIER LABEL → CAMERA → AI UNDERSTANDING → STRUCTURED DATA
              → HUMAN VERIFICATION → COLOR METAL LABEL → A5 PRINT / PDF
```

---

## 1. What it does

Color Metal buys sheets, coils, bars and profiles from many suppliers. Each supplier
attaches its own printed label. When material is forwarded to the final customer with
that label still on it, the customer learns where Color Metal buys.

This tool removes that problem without anyone retyping a label:

1. An employee opens the app on a phone and presses **Scan Label**.
2. The rear camera opens with an A4 framing guide.
3. The photo is checked, then analysed by a multimodal AI that reads the *whole*
   document semantically — no fixed template, no fixed positions, no supplier-specific
   parsing.
4. Supplier identity (name, logo, address, contact details, branding, employee names,
   QR/barcodes) is separated out and **never** reaches the printed label.
5. The employee reviews and corrects every value on screen, with low-confidence fields
   highlighted and the original photo beside them.
6. A professional Color Metal A5 label is generated, printed or exported as PDF, and
   saved to history.

### Design rules that are not negotiable

| Rule | Where it lives |
|---|---|
| Nothing supplier-identifying is ever printed | `src/domain/sanitize.ts` (3 independent layers) |
| AI output never goes straight to print | `src/routes/ReviewPage.tsx` |
| Numbers are never silently "corrected" (`0,80` stays `0,80`) | `src/domain/extraction.ts`, the AI prompt |
| Units are never invented — `690` never becomes `690 kg` | the AI prompt, warning `UNIT_NOT_PRINTED` |
| Color Metal is the **customer** on these labels, never the supplier | `isColorMetal()`, prompt §3 |
| Supplier QR/barcodes are detected but never reproduced | `codes` in the schema; nothing renders them |
| The sheet carries no generator credit, no template version and no note about the original label | `domain/labelDocument.ts` |
| Procurement references (purchase order, supplier production order, goods-receipt address) never print | `omitFromLabel` in `domain/fields.ts` |
| The supplier's own article/product code never prints | `isSupplierCodeCaption()` in `domain/fields.ts` |
| The AI key never touches the browser | Supabase Edge Function |

---

## 2. Architecture

```
┌─────────────────────────────── Phone / desktop browser ───────────────────────────────┐
│  React 18 + TypeScript + Vite  (static files — GitHub Pages, HashRouter)               │
│                                                                                       │
│  camera ──► image optimisation ──► repository ──► review UI ──► A5 renderer            │
│  getUserMedia   resize/compress     Supabase        editable      HTML print + pdf-lib │
│                 quality checks      or localStorage  + guards      vector PDF          │
└───────────────────────────────────────┬───────────────────────────────────────────────┘
                    anon key (public)   │   photo → private bucket
                                        ▼
┌──────────────────────────────────── Supabase ─────────────────────────────────────────┐
│  Postgres  public.labels (JSONB) · next_cm_id() · RLS   (optional — see §6)            │
│  Storage   label-sources (private, signed URLs only)                                   │
│  Edge Fn   extract-label  ── holds the AI key ── validates ── rate limits              │
└───────────────────────────────────────┬───────────────────────────────────────────────┘
                                        ▼
                      Anthropic Claude (default) or OpenAI — swappable
```

**Why these choices**

* **React + TypeScript + Vite** — one developer can maintain it; builds to static files,
  so GitHub Pages works with no server.
* **HashRouter** — GitHub Pages cannot rewrite unknown paths to `index.html`. Hash routes
  survive a refresh and a deep link with zero server configuration.
* **Supabase Edge Functions** — the only server-side piece needed. The AI key lives in a
  function secret; the browser only ever holds the public anon key.
* **Google Gemini as the default vision model** — the deciding factor was cost, not
  capability: the Gemini Flash models have a genuinely free tier with image input, which
  is what lets this run without a per-scan bill. Anthropic Claude is the stronger reader of
  small multilingual print and stays available as a paid alternative, as does OpenAI. None
  of them is wired in directly: both the server
  (`supabase/functions/_shared/providers/`) and the client
  (`src/features/extraction/provider.ts`) talk to a `LabelExtractionProvider` interface, so
  switching vendor is one secret: `supabase secrets set AI_PROVIDER=anthropic`.
* **One wide JSONB table** rather than a normalised field model — supplier labels are not
  standardized, the field set changes with every new supplier, and every query is either
  "this label" or "the last N labels".

### Project structure

```
cm-label-generator/
├── index.html
├── vite.config.ts                  base path for GitHub Pages, vitest config
├── .env.example                    PUBLIC frontend variables only
├── .github/workflows/deploy.yml    typecheck → test → build → Pages
│
├── public/branding/                cm-logo.png, favicon.svg  ← swap the logo here
│
├── src/
│   ├── branding/brand.ts           SINGLE SOURCE OF TRUTH for colour + logo
│   ├── config/env.ts               typed, validated public configuration
│   │
│   ├── domain/                     pure, framework-free, fully unit-tested
│   │   ├── fields.ts               THE FIELD CATALOGUE — one list drives everything
│   │   ├── extraction.ts           tolerant Zod schema + normaliser
│   │   ├── sanitize.ts             "Color Metalization" — supplier suppression
│   │   ├── labelDocument.ts        the printable A5 document model (RO / EN)
│   │   ├── labelRecord.ts          the persisted record
│   │   └── cmId.ts                 CM-YYYYMMDD-XXXX
│   │
│   ├── lib/
│   │   ├── errors.ts               every failure → an actionable message
│   │   ├── supabase.ts             anon client
│   │   ├── image/                  preprocess.ts (resize/compress) · quality.ts
│   │   └── data/                   repository.ts + supabase / local implementations
│   │
│   ├── features/
│   │   ├── camera/                 useCamera.ts · CameraScanner.tsx · PhotoPreview.tsx
│   │   ├── extraction/             provider.ts · edgeFunctionProvider · mockProvider
│   │   │                           fixtures.ts · pipeline.ts · ProcessingView.tsx
│   │   ├── review/                 ReviewForm · FieldRow · RemovedPanel · guards
│   │   ├── label/                  LabelSheet.tsx · pdfExport.ts
│   │   └── history/                RecentLabels.tsx
│   │
│   ├── routes/                     Home · Scan · Review · Label · History
│   ├── state/scanSession.ts        in-flight scan (zustand)
│   └── styles/                     tokens · base · label · print
│
├── scripts/verify-flow.mjs         optional end-to-end screenshot run
│
└── supabase/
    ├── config.toml
    ├── migrations/                 schema, RLS, next_cm_id(), private bucket
    └── functions/
        ├── _shared/                cors · prompt · schema · validation · rateLimit
        │   └── providers/          types · anthropic · openai · registry
        └── extract-label/index.ts
```

---

## 3. Prerequisites

* **Node.js 20.11+** and npm (`.nvmrc` pins 20)
* A **Supabase** project — free tier is enough
* The **Supabase CLI** (`npm i -g supabase`) for migrations and function deployment
* An **Anthropic** or **OpenAI** API key
* For phone testing: the app must be served over **HTTPS** (browsers block the camera
  otherwise; `localhost` is exempt)

Nothing above is needed to try the interface — see **§7 Mock mode**.

---

## 4. Local setup

```bash
npm install
cp .env.example .env      # leave it empty to start in mock mode
npm run dev               # http://localhost:5173
```

`npm run dev` binds to `0.0.0.0`, so you can open it from a phone on the same Wi-Fi at
`http://<your-computer-ip>:5173` — but the camera will refuse to start over plain HTTP.
See **§9 Testing on a phone**.

| Command | What it does |
|---|---|
| `npm run dev` | dev server with hot reload |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | unit tests (vitest) |
| `npm run build` | typecheck + production build into `dist/` |
| `npm run build:pages` | build with the `/cm-label-generator/` base path |
| `npm run preview` | serve the built `dist/` locally |

---

## 5. Supabase setup

### 5.1 Create the project and run the migrations

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

Or paste the two files in `supabase/migrations/` into the SQL editor, in filename order.

They create:

* `public.labels` — one row per scan, with JSONB payloads and denormalised summary columns
* `public.cm_id_counters` + `public.next_cm_id()` — atomic `CM-YYYYMMDD-NNNN` generation
* `public.extraction_rate_events` — sliding-window rate limiting for the Edge Function
* indexes on `created_at`, `status`, `cm_id`; an `updated_at` trigger
* **row level security** on every table (see §11)
* the private `label-sources` storage bucket and its object policies

### 5.2 Storage (optional)

If you set `VITE_PERSISTENCE=local`, skip this section and §5.1 entirely — the only
Supabase piece you need is the Edge Function in §5.3, which exists purely so the AI key
never reaches the browser. Labels then live in the phone's own storage and nothing about
a delivery leaves the device except the single extraction call.



The migration creates the bucket for you: **private**, 8 MB limit, JPEG/PNG/WebP only.
The app never builds public URLs — it requests a 10-minute signed URL when it needs to
show a photo. Retention is deliberate for the MVP so you can inspect extraction quality;
all image handling is isolated in `LabelRepository`, so changing the policy later means
changing `uploadSourceImage()` and adding a scheduled cleanup, and nothing else.

To turn retention off entirely, set `VITE_RETAIN_SOURCE_IMAGE=false` — the pipeline then
sends the photo inline to the Edge Function and never stores it.

### 5.3 Deploy the Edge Function

```bash
supabase functions deploy extract-label --no-verify-jwt
```

`--no-verify-jwt` is required while there is no login (see §11). Once you add Supabase
Auth, drop the flag and set `verify_jwt = true` in `supabase/config.toml`.

**No CLI?** The Supabase dashboard (Edge Functions → Deploy a new function → Via Editor)
deploys a single file. `supabase/functions/extract-label/index.bundled.ts` is exactly that:
the modular sources concatenated, generated by

```bash
node scripts/bundle-edge-function.mjs
```

Edit the modular files under `supabase/functions/`, never the bundle — then regenerate.

### 5.4 Configure the AI secret

**The API key goes here and nowhere else.** It must never appear in `.env`, in the
frontend, or in the repository.

```bash
# Google Gemini (default) — free tier, no card required
supabase secrets set GOOGLE_API_KEY=...

# or Anthropic
supabase secrets set AI_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-...

# or OpenAI
supabase secrets set AI_PROVIDER=openai OPENAI_API_KEY=sk-...

# optional
supabase secrets set AI_MODEL=<model-id>            # override the provider default
supabase secrets set ALLOWED_ORIGINS=https://<you>.github.io,http://localhost:5173
supabase secrets set RATE_LIMIT_MAX=40 RATE_LIMIT_WINDOW_SECONDS=300
```

Get a Gemini key at <https://aistudio.google.com/apikey> — no credit card, no billing
account. `AI_PROVIDER` may be omitted: whichever key is present is used, Google first.

**On the free tier and confidentiality.** Google's default terms for unpaid use say
submitted content may be used to improve its products and may be read by human reviewers.
That would be disqualifying for supplier documents. The exception is what makes this
workable here: Google's API terms state that for users **in the European Economic Area,
Switzerland or the UK, the paid-service data terms apply to all services, including the
unpaid Gemini API quota** — no training on your content, no human review. Color Metal is in
Romania, so that is the applicable regime. Re-check this before deploying the app outside
the EEA, and prefer a paid provider there.

Or from the dashboard: **Project settings → Edge Functions → Secrets**.
`supabase/functions/.env.example` documents every variable.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the platform —
do not set them yourself.

> **Model IDs move.** `AI_MODEL` exists precisely so you never have to edit code when a
> newer Gemini, Claude or GPT release comes out. The defaults are in
> `supabase/functions/_shared/providers/google.ts`, `anthropic.ts` and `openai.ts`.

> **The free tier has a daily ceiling, not just a per-minute one.** The Gemini provider
> tells the two apart and the app says *"Today's free label readings are used up"* rather
> than *"wait a minute"*, because the difference is an afternoon of someone's time. Manual
> entry keeps working when that happens.

### 5.5 Point the frontend at Supabase

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<the anon / publishable key>
```

Both are public by design — RLS is what protects the data. **Never** put the
`service_role` key here.

---

## 6. Frontend configuration

Every variable is documented in `.env.example`. The ones that matter:

| Variable | Default | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | empty | public Supabase credentials |
| `VITE_MOCK_MODE` | `auto` | `auto` = mock while Supabase is unset; `true`/`false` force it |
| `VITE_PERSISTENCE` | `auto` | `local` keeps every label on the device and uploads nothing |
| `VITE_IMAGE_MAX_EDGE` | `2200` | longest edge after downscaling — don't go below ~1600 |
| `VITE_IMAGE_TARGET_BYTES` | `2200000` | upload budget; JPEG quality steps down to reach it |
| `VITE_RETAIN_SOURCE_IMAGE` | `true` | keep the photograph in Storage |
| `VITE_CM_LOGO_URL` | empty | override the bundled logo |
| `VITE_BASE_PATH` | `/` | build-time base path (set by the Pages workflow) |

### Branding

The palette and logo were taken from the official Color Metal lockup — gold `#BFA060`
for **COLOR**, neutral grey `#939393` for **METAL**.

* **Logo** — replace `public/branding/cm-logo.png`. Nothing else changes: the app header,
  the A4 preview, the print output and the PDF export all read from there. PNG or JPEG
  keeps the PDF export able to embed it; SVG works everywhere except inside the PDF.
* **Colour** — edit `palette` in `src/branding/brand.ts`. Values are mirrored into CSS
  custom properties at boot, so stylesheets and the PDF renderer cannot drift apart.

The printed label is near-monochrome with one gold accent rule on purpose: it must come
out identical on any office laser printer, including one with no colour toner.

### Label language

The A4 label prints **Romanian captions by default** (`Aliaj`, `Stare`, `Cantitate netă`,
`Număr bucăți`…), matching the labels Color Metal produces today, with an **RO / EN**
toggle on the label screen. The captions live in `src/domain/fields.ts` — adding a third
language means adding one column there.

---

## 7. Mock mode

Mock mode runs the **entire** workflow with no Supabase project and no AI credentials:
scan → processing → extracted data → review → CM label → print preview → saved history.

It is on automatically when `VITE_SUPABASE_URL` is empty, and the home screen shows a
**Demo mode** notice. Force it either way with `VITE_MOCK_MODE=true|false`.

In mock mode:

* extraction comes from `src/features/extraction/fixtures.ts`
* records are saved in `localStorage`; photos in IndexedDB
* nothing leaves the device

Three deliberately different supplier layouts are bundled so nothing in the pipeline can
quietly become specific to one supplier. The first scan returns the one matching the real
ALCOMET sample; later scans rotate:

| Fixture | What it exercises |
|---|---|
| `alcometAngleProfile` | English captions, supplier logo + QR, **weights printed with no unit**, ambiguous `50/50/2/0` thickness, Cyrillic packer name to suppress |
| `germanCoil` | German captions, **decimal comma** `0,80 mm`, supplier website and phone printed on the label |
| `italianSheet` | Italian captions, bare strings/numbers instead of field objects, a `Fornitore` field the model did *not* flag, and free text naming the manufacturer |

The same fixtures are the unit-test corpus, so mock mode and the tests can never disagree.

---

## 8. GitHub Pages deployment

`.github/workflows/deploy.yml` typechecks, tests, builds and publishes on every push to
`main`.

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**
2. **Settings → Secrets and variables → Actions → Variables** — add:
   * `VITE_SUPABASE_URL`
   * `VITE_SUPABASE_ANON_KEY`
   * optionally `VITE_BASE_PATH` (`/` for a user site or custom domain; leave unset for a
     project site and the workflow derives `/<repo>/` automatically)
3. Push to `main`. The site appears at `https://<owner>.github.io/<repo>/`.
4. Add that origin to `ALLOWED_ORIGINS` in the Edge Function secrets.

GitHub Pages serves HTTPS, which is exactly what the camera API requires.

Building by hand:

```bash
VITE_BASE_PATH=/cm-label-generator/ npm run build
```

There is deliberately **no Node backend** — everything server-side is a Supabase Edge
Function.

---

## 9. Testing on a phone

The camera needs a secure context. Three ways, easiest first:

1. **Deploy to GitHub Pages** and open the URL on the phone. HTTPS, done.
2. **Tunnel the dev server**: `npx cloudflared tunnel --url http://localhost:5173`
   (or `ngrok http 5173`) and open the HTTPS URL it prints.
3. **`localhost` on the phone itself** — only useful in a simulator.

Then, on the phone:

1. Open the URL, press **Scan Label**, allow camera access when asked.
2. Fill the frame with the supplier label; hold still until the text is sharp; use the
   flash chip on Android if the warehouse is dark.
3. Press the shutter → check the photo → **Analyze label**.
4. Verify the highlighted fields, fill in **Client** and **Delivery address**.
5. **Generate CM Label** → **Print label** (choose A4, scale 100 %, *not* "fit to page").
6. Add to Home Screen for a full-screen, app-like experience.

If the camera cannot start, the scanner falls back to the phone's own camera app via
`<input capture="environment">` — still a photograph, never a silent file-picker
replacement.

### Optional: automated screenshot run

```bash
npm run build && npm run preview          # terminal 1
npm i -D playwright && npx playwright install chromium
node scripts/verify-flow.mjs ./sample-label.jpg
```

Drives the whole flow at iPhone size and writes screenshots of every step plus the
printed A4 sheet into `./verification`.

---

## 10. Printing and PDF

* **Print label** — `window.print()` with real print CSS: `@page { size: A5; margin: 0 }`,
  the sheet fixed at 148 × 210 mm, all application chrome removed. Choosing "Save as PDF"
  in the print dialog gives a crisp, fully Unicode-correct PDF. If your printer only holds
  A4, print two labels per sheet or let the printer centre a single A5.
* **Export PDF** — builds a genuine **vector** A5 PDF with `pdf-lib`: real selectable text,
  no screenshot, no rasterisation. It shares the same `LabelDocument` model as the HTML
  renderer, so the two can never describe different labels. pdf-lib loads only when this
  button is pressed, keeping the scan flow light on mobile.
  *Limitation:* the standard PDF fonts use WinAnsi encoding, which has no `ă ș ț ő ű` or
  Cyrillic — those are transliterated. For byte-perfect Romanian diacritics use
  **Print → Save as PDF**.

If the content does not fit on one sheet, the preview says so rather than silently
clipping a row.

---

## 11. Security

* **AI keys** exist only as Edge Function secrets. There is no code path that can read
  them from the browser.
* **Service-role key** is injected into the function by the platform and is never in the
  bundle. The frontend uses only the public anon key.
* **Storage is private.** No public URLs; 10-minute signed URLs only.
* **Validation everywhere** — request shape and path traversal (`parseRequest`), image
  format by *magic bytes* rather than the caller's claim (`sniffImageMime`), size limits
  on both sides, model JSON parsed defensively and bounded in string length, array length
  and nesting depth (`boundPayload`).
* **Rate limiting** — sliding window per client IP in `extraction_rate_events`,
  configurable, and deliberately **fails open**: a warehouse employee is never blocked by
  our own bookkeeping.
* **CORS** — `ALLOWED_ORIGINS` restricts who may call the function.
* **No DELETE policy anywhere.** Labels and photographs cannot be destroyed through the
  API.

### The authentication trade-off, stated plainly

The MVP ships **without login** so an employee can open a URL and scan. RLS is *enabled*
on every table, but the policies grant `select`/`insert`/`update` to the `anon` role.
Anyone who has the (public) anon key and the URL can therefore read and write labels.

That is acceptable for a first internal tool because the data contains no personal
information, the URL is shared internally, and deletion is impossible. It is **not**
acceptable for a public rollout.

**To lock it down** — the change is small and the code is already organised for it:

1. Enable Supabase Auth and add a login screen.
2. In both migrations, replace `to anon, authenticated` with `to authenticated`; re-push.
3. Set `verify_jwt = true` in `supabase/config.toml` and redeploy the function.
4. In `src/lib/supabase.ts`, flip `persistSession` / `autoRefreshToken` to `true`.

---

## 12. Tests

```bash
npm test
```

72 unit tests over the logic that would be expensive to get wrong:

| File | Covers |
|---|---|
| `domain/__tests__/sanitize.test.ts` | supplier-caption detection in 12 languages; Color Metal preserved as the customer; the `Mill` finish surviving the "mill name" rule; **the `Acciai Speciali` vs `Acciaio inox` false positive** that would silently delete product data; contact-detail removal; input never mutated |
| `domain/__tests__/extraction.test.ts` | all three fixtures; units never invented; decimal commas preserved; JSON numbers coerced *with a warning*; unknown keys harvested instead of dropped; snake_case aliases; garbage input degrading instead of throwing |
| `domain/__tests__/labelDocument.test.ts` | empty fields and empty sections never emitted; delivery block; RO/EN captions; the render guard catching a simulated leak; **procurement references, the supplier's article code, the generator credit and the "codes not reproduced" note all kept off the sheet**; composed dimensions; history summaries |
| `domain/__tests__/cmId.test.ts` | format, ambiguous characters excluded, uniqueness, parsing, coercion |
| `features/review/__tests__/guards.test.ts` | the review form refusing to re-introduce supplier branding |
| `lib/image/__tests__/preprocess.test.ts` | downscaling geometry, crop clamping, dark/blurred/washed-out detection |

The domain layer is pure and framework-free, which is why it is worth testing at all.

---

## 13. Known MVP limitations

* **No authentication.** See §11.
* **No document edge detection or perspective correction.** The framing guide asks the
  employee to fill the frame. The seam is in place: `preprocessImage()` already accepts a
  `crop` region and `resolveCrop()` is unit-tested, so adding a corner-drag or automatic
  quad is a change in one file plus a UI.
* **Supplier QR/barcodes are counted, never decoded.** Generating *Color Metal* QR codes
  is deliberately left out; the A4 template already reserves the slot (`.a4__code-slot`).
* **Confidence is the model's own estimate.** It is a hint for the reviewer, not proof.
  Nothing is printed without a human pressing Generate.
* **One label per photo.** Photographing two labels at once produces a warning, not a
  best guess.
* **PDF export transliterates Romanian diacritics** (see §10). Print → Save as PDF does not.
* **History is a flat list of the last 50.** No search, filters or statistics yet.
* **Field-level supplier suppression is rule-based** as its second layer. It is
  deliberately biased towards *keeping* uncertain data and flagging it, because deleting a
  real thickness is worse than showing a reviewer one extra row.
* **No warehouse/site selection, no ERP integration, no batch scanning, no reprint
  approval workflow.** All were considered and left out to keep the MVP focused; the field
  catalogue, the ID scheme and the repository interface are the extension points.

---

## 14. How the "Color Metalization" actually works

Three independent layers, deliberately redundant, because a single missed rule means a
customer learns a supplier's name.

1. **Model layer.** The extraction prompt (`supabase/functions/_shared/prompt.ts`) tells
   the model to place anything supplier-identifying into `sensitiveSupplierInformation[]`
   instead of into product fields — and, just as firmly, *not* to delete product data out
   of caution.
2. **Rule layer.** `colorMetalize()` removes fields whose *caption* names a supplier role
   (in English, German, Italian, French, Spanish, Romanian, Hungarian, Dutch, Polish,
   Czech, Bulgarian…), whose *value* repeats something already flagged, or that look like
   contact details — regardless of what the model decided. The flagged values are then
   cleared from the data object entirely, so supplier identity is never carried into the
   database, the label, or an export.
3. **Render guard.** `assertNoSupplierLeak()` re-scans the finished label rows immediately
   before printing and drops anything that still matches, adding a visible note.

Matching is conservative in **both** directions: whole-word equality for single tokens,
prefix matching only for tokens of 7+ characters, substring matching only for multi-word
phrases, and generic industry words (`metal`, `aluminium`, `steel`, `gmbh`, `srl`…)
stopworded out. That is what stops a supplier called *Acciai Speciali Lombardi* from
deleting the material *Acciaio inox*.

The review screen shows exactly what was withheld under **Removed supplier information** —
read-only, for internal verification. The field editor refuses to let anyone re-introduce
it by renaming a field or retyping the value.

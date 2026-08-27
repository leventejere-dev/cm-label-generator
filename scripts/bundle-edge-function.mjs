/**
 * Concatenate the modular Edge Function sources into a single entrypoint.
 *
 * Why: the Supabase dashboard's function editor deploys ONE file. `supabase
 * functions deploy` handles the modular layout fine, so this bundle exists only
 * for dashboard deployments and for anyone without the CLI.
 *
 *   node scripts/bundle-edge-function.mjs
 *
 * Output: supabase/functions/extract-label/index.bundled.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const base = path.join(root, 'supabase', 'functions');

const ORDER = [
  '_shared/cors.ts',
  '_shared/prompt.ts',
  '_shared/schema.ts',
  '_shared/validation.ts',
  '_shared/providers/types.ts',
  '_shared/providers/anthropic.ts',
  '_shared/providers/openai.ts',
  '_shared/providers/index.ts',
  '_shared/rateLimit.ts',
  'extract-label/index.ts',
];

/** Per-file renames for module-scoped names that collide once concatenated. */
const RENAMES = {
  '_shared/providers/anthropic.ts': { API_URL: 'ANTHROPIC_API_URL', DEFAULT_MODEL: 'ANTHROPIC_DEFAULT_MODEL' },
  '_shared/providers/openai.ts': { API_URL: 'OPENAI_API_URL', DEFAULT_MODEL: 'OPENAI_DEFAULT_MODEL' },
};

/**
 * Remove every `import ...;` statement (including multi-line ones) and every
 * bare re-export (`export { X };`) — once the modules are concatenated those
 * names are already in scope and re-exporting them is a duplicate declaration.
 */
function stripImports(source) {
  const lines = source.split('\n');
  const out = [];
  let inImport = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!inImport && /^import[\s{*]/.test(trimmed)) {
      if (!trimmed.endsWith(';')) inImport = true;
      continue;
    }
    if (inImport) {
      if (trimmed.endsWith(';')) inImport = false;
      continue;
    }
    if (/^export\s+(type\s+)?\{[^}]*\}\s*;\s*$/.test(trimmed)) continue;
    out.push(line);
  }
  return out.join('\n');
}

const header = `// ---------------------------------------------------------------------------
// extract-label — SINGLE-FILE BUILD (GENERATED — do not edit here)
// ---------------------------------------------------------------------------
// The modular source is the canonical version and is far easier to read:
//
//   supabase/functions/_shared/prompt.ts          the extraction prompt
//   supabase/functions/_shared/schema.ts          the JSON schema
//   supabase/functions/_shared/validation.ts      request + response validation
//   supabase/functions/_shared/providers/*.ts     the vendor abstraction
//   supabase/functions/_shared/rateLimit.ts
//   supabase/functions/extract-label/index.ts
//
// This file exists because the Supabase dashboard deploys a single entrypoint.
// Regenerate:  node scripts/bundle-edge-function.mjs
// Or deploy the modular version:  supabase functions deploy extract-label
// ---------------------------------------------------------------------------

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
`;

const chunks = [header];
for (const rel of ORDER) {
  let body = stripImports(fs.readFileSync(path.join(base, rel), 'utf8'));
  for (const [from, to] of Object.entries(RENAMES[rel] ?? {})) {
    body = body.replace(new RegExp(`\\b${from}\\b`, 'g'), to);
  }
  chunks.push(
    `\n// =========================================================================\n// ${rel}\n// =========================================================================\n${body}`,
  );
}

const bundle = chunks.join('\n');

const leftovers = bundle.split('\n').filter((l) => /from '\.{1,2}\//.test(l));
if (leftovers.length) {
  console.error('Unresolved relative imports remain:\n' + leftovers.join('\n'));
  process.exit(1);
}

const names = [...bundle.matchAll(/^(?:export )?(?:const|function|class|interface|type|enum) (\w+)/gm)].map((m) => m[1]);
const dupes = names.filter((n, i) => names.indexOf(n) !== i);
if (dupes.length) {
  console.error('Duplicate top-level declarations: ' + [...new Set(dupes)].join(', '));
  process.exit(1);
}

const out = path.join(base, 'extract-label', 'index.bundled.ts');
fs.writeFileSync(out, bundle);
console.log(`Wrote ${out} (${bundle.split('\n').length} lines)`);

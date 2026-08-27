# Publishing CM Label Generator to GitHub Pages

Everything below is copy-paste. Run it from **inside this folder** (the one containing
`package.json`). Windows PowerShell, macOS and Linux are all fine.

The site goes live in **demo mode** first — no Supabase, no AI key needed — so you can
open it on your phone and walk the whole flow immediately. Connecting Supabase is step 4
and can happen any time later.

---

## 1. Push the code

### Option A — you have the GitHub CLI (`gh`)

```bash
git init -b main
git add .
git commit -m "Initial commit: CM Label Generator MVP"

gh repo create cm-label-generator --public --source . --remote origin --push

# Turn on GitHub Pages, built by the workflow in .github/workflows/deploy.yml
gh api -X POST "repos/$(gh api user --jq .login)/cm-label-generator/pages" \
  -f build_type=workflow
```

No `gh`? Install it once: `winget install GitHub.cli` (Windows) or
`brew install gh` (macOS), then `gh auth login`.

### Option B — plain git

1. Open <https://github.com/new>
   * Repository name: `cm-label-generator`
   * Public
   * **Do not** add a README, .gitignore or licence — the repo must be empty.

2. Then:

```bash
git init -b main
git add .
git commit -m "Initial commit: CM Label Generator MVP"
git remote add origin https://github.com/<your-username>/cm-label-generator.git
git push -u origin main
```

3. **Settings → Pages → Build and deployment → Source: `GitHub Actions`**

---

## 2. Watch the build

**Actions** tab → the *Deploy to GitHub Pages* run. It typechecks, runs the 72 tests,
builds, and publishes. Two to three minutes.

> If the very first run fails at the *deploy* step with `Get Pages site failed`, Pages was
> not switched on yet. Do step 1's Pages command (or Settings → Pages → Source: GitHub
> Actions), then **Re-run all jobs**.

---

## 3. Open it

```
https://<your-username>.github.io/cm-label-generator/
```

On the phone: press **Scan Label** → allow the camera → photograph a supplier label →
**Analyze label** → review → **Generate CM Label** → **Print label**.
In demo mode the extraction comes from bundled fixtures, but every other step — camera,
image optimisation, supplier suppression, review, A4 layout, printing, history — is the
real code path.

Add it to the Home Screen for a full-screen, scanner-like experience.

---

## 4. Connect Supabase and the AI (when you want real extraction)

```bash
supabase link --project-ref <your-project-ref>
supabase db push
supabase functions deploy extract-label --no-verify-jwt
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set ALLOWED_ORIGINS=https://<your-username>.github.io
```

Then add two **repository variables** (Settings → Secrets and variables → Actions →
Variables tab — *variables*, not secrets):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the anon / publishable key |

Push anything (or re-run the workflow) and the app leaves demo mode automatically.
The AI key stays in Supabase and never reaches the browser bundle.

Full detail: `README.md` §5 and §8.

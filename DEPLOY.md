# Deployment Runbook — Vercel + Supabase

This app was migrated from local SQLite + filesystem uploads to **Vercel (Hobby) +
Supabase (free tier)**. Audio is uploaded **directly from the browser to Supabase
Storage** (never through an API route), and the processing pipeline runs
**synchronously inside the request** (`maxDuration = 300`).

> Production architecture notes (why things are the way they are):
> - Vercel request bodies are capped at 4.5 MB → audio (25–200 MB) uploads
>   straight to Supabase Storage via a short-lived signed URL.
> - Vercel freezes a function after its response → we run the pipeline inside
>   the request, not in a background `after()`.
> - Vercel has no persistent disk → SQLite + `uploads/` are gone; Postgres +
>   Storage replace them.
> - Supabase **free tier** caps individual Storage objects at **50 MB** (the
>   bucket was created WITHOUT the 200 MB `fileSizeLimit` for this reason). If
>   you need >50 MB uploads, move to the Pro plan (1 GB object limit) and set
>   the bucket's `fileSizeLimit` there.
> - Supabase pauses free projects after ~7 days without DB activity → the
>   `/api/keep-alive` route runs a real query; ping it from cron-job.org.

---

## 1. Push the repo to GitHub
Private is fine. Make sure `.env` is NOT committed (it is gitignored; verify with
`git ls-files | grep -i "\.env"` → should be empty).

## 2. Import into Vercel
1. Go to vercel.com → sign in with GitHub → **Add New → Project** → import the repo.
2. Framework Preset: **Next.js** (auto-detected). Build command and output are
   already configured in `package.json` (`prisma generate && next build`) and
   `next.config.ts`. No rewrite/proxy is configured.
3. Click **Deploy**. The first deploy may fail at build if env vars are missing —
   that's expected; continue to step 3.

## 3. Add Environment Variables
In Vercel → Project → **Settings → Environment Variables**, add **every** value
from `.env.example` (real values; do NOT copy the local `.env` blindly):

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Supabase **Connection Pooler** (session mode, port **5432**), e.g. `postgresql://postgres.<ref>:<pw>@aws-<region>.pooler.supabase.com:5432/postgres?pgbouncer=true&connection_limit=1` |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service-role key (Dashboard → Settings → API) — **server only** |
| `GEMINI_API_KEY` | your real Gemini key |
| `GEMINI_MODEL` | `gemini-3.7-flash` |
| `GEMINI_FALLBACK_MODELS` | `gemini-3.6-flash,gemini-2.5-flash` |
| `GEMINI_TIMEOUT_MS` | `300000` |
| `GEMINI_MOCK` | `0`  ← real AI calls in production |
| `AUTH_SECRET` | a fresh value: `openssl rand -hex 32` |
| `MAX_AUDIO_BYTES` | `209715200` |
| `GITHUB_TOKEN` | (optional) repo-scoped PAT |
| `GITHUB_REPO` | (optional) `owner/repo` |
| `GITHUB_BRANCH` | `main` |
| `GITHUB_BASE_DIR` | `subjects` |

> The storage bucket `lecture-audio` and the DB tables were already created
> during the migration (Phase 1). Do NOT recreate them.

## 4. Redeploy
After adding env vars, go back to **Deployments** and click **Redeploy** (or push
a commit). The build must succeed (`npm run build` is verified locally).

## 5. Create the production account
The production account was already created during the migration and lives in the
Supabase Postgres DB (the migration used the real `DATABASE_URL`). Credentials:

- **email:** `admin@lecturenotes.app`
- **password:** `rIcShVDiLbzxu2WE`  *(generated during migration; change it via the
  login screen's reset flow or by re-running the script below)*

To create/reset an account from your local machine (same env as Vercel's):
```bash
npx tsx scripts/create-user.ts <email> <password>
```

## 6. Verify
1. Open the Vercel URL → log in (use the account above or your new one).
2. Create a subject → **Record** → record ~30 s of real speech with the real
   Gemini key → a note should generate in 1–3 min.
3. Also try **Upload Audio File** — it uses the same direct-to-Storage path.

## 7. Keep-alive (prevents Supabase's 7-day pause)
1. Go to cron-job.org (free) → **Create Cronjob**.
2. URL: `https://YOUR-APP.vercel.app/api/keep-alive`
3. Schedule: **every 12 hours** → Create.
Done forever.

## 8. Troubleshooting
- **Prisma connection errors (ECONNREFUSED / IPv6):** switch `DATABASE_URL` to the
  Supabase **pooler** URI on port **5432** (session mode), as in step 3.
- **Upload fails (403/400 on the signed URL PUT):** confirm the bucket
  `lecture-audio` exists and is **private**. If the raw `PUT` still fails, switch
  the browser to `@supabase/supabase-js` `uploadToSignedUrl(path, token, blob)`
  with `SUPABASE_ANON_KEY` (the current code uses the raw `PUT` and works).
- **Lecture stuck PROCESSING:** the 15-min `/status` timeout will mark it
  **FAILED**; then use **Retry**. Never redeploy while a lecture is PROCESSING.
- **>50 MB audio rejected by Storage:** free-tier object limit is 50 MB — upgrade
  to Supabase Pro or split the recording.
- **Rotate the Gemini API key** before going live if the key in `.env` was ever
  printed to a report file (generate a new one in Google AI Studio and update the
  Vercel env var).

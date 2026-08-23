# Lecture Notes AI — Worklog

---
Task ID: 1
Agent: Main agent (Z.ai Code)
Task: Build "Lecture Notes AI" — a Linear-style dark frontend for a tool that converts college lecture recordings into structured Markdown study notes stored in the user's private GitHub repository. Wine-red accent design system, hand-crafted CSS (no frameworks), per detailed design spec.

Work Log:
- Explored existing Next.js 16 scaffold (Tailwind/shadcn present but deliberately unused — user spec mandates hand-crafted CSS with CSS custom properties).
- Installed `remark-gfm`; defined Prisma schema (User w/ passwordHash + GitHub fields, Subject, Lecture w/ processing-simulation fields) and pushed to SQLite via `bun run db:push`.
- Quieted Prisma query logging in `src/lib/db.ts` (error/warn only) to keep dev.log readable during polling.
- Backend (`src/lib/auth.ts`): scrypt password hashing, HMAC-signed bearer tokens (30-day TTL), `getAuthUser`/`getUserId` helpers.
- Backend (`src/lib/lecture-state.ts`): simulated AI pipeline — 3 timed stages over ~30s (Transcribing 5→45%, Structuring 45→78%, Writing summary 78→96% → COMPLETED), 15% random failure flag (fails at ~16s), retry always succeeds; 3 realistic markdown note templates chosen by id hash.
- API routes (all under `src/app/api/`): `auth/register`, `auth/login`, `me`, `health`, `subjects` (GET list w/ counts+last-lecture, POST w/ dupe check), `subjects/[id]` (GET w/ lectures, DELETE), `lectures` (GET by subject, POST), `lectures/[id]` (GET, DELETE), `lectures/[id]/status` (live progress + state transitions), `lectures/[id]/audio` (multipart upload, 200MB cap, discards payload — transcription simulated), `lectures/[id]/retry`, `github/status|connect|disconnect` (simulated OAuth).
- Design system (`src/app/globals.css`, ~1700 lines): exact hex tokens from spec (near-black surfaces, wine 900→100, hairline rgba borders, Inter/JetBrains Mono via next/font), typography classes (.display/.heading/.subheading/.body/.caption/.mono), components (inputs, buttons, subject cards, status pills, lecture rows, modal, toasts, skeletons, progress bar, markdown styles), responsive (sidebar 240px → icon-only 64px <1100px → bottom tabs + topbar <768px), prefers-reduced-motion, custom scrollbars, safe-area insets.
- Frontend core: `src/lib/api.ts` (typed fetch client, bearer auth, 401 auto-logout), `src/lib/router.ts` (hash router w/ query params — single `/` route requirement respected), `src/lib/format.ts` (dates/durations/clock), `src/context/AuthContext.tsx`, `src/context/ToastContext.tsx`.
- Components: Layout/Sidebar/Topbar/bottom-tabs shell, Button (primary/secondary/ghost/danger + loading), Input/Select/Textarea/Field, StatusPill (5 states), EmptyState, Modal (Esc/overlay close).
- Views: Login/Register (centered auth cards, validation), Subjects (grid + new-subject modal + skeleton + empty state), SubjectDetail (lecture rows w/ live processing poll, delete w/ confirm), Record (MediaRecorder w/ graceful timer-only fallback when mic unavailable, file upload w/ client-side duration read, beforeunload guard), LectureDetail (react-markdown + remark-gfm, live progress polling every 2s, failed panel + retry, metadata sidebar w/ GitHub link), Settings (GitHub connect modal simulating OAuth, API health, account/sign-out).
- Fixed lint errors (react-hooks/set-state-in-effect): async restore wrapper in AuthContext, component `key` remounting for detail views, progress reset moved into load callback.
- Fixed runtime bug: `generateMarkdown` crashed on missing `lecture.subject` in status route → refactored to pass subjectName explicitly from all callers.
- Switched font loading to `next/font/google` (Inter 400-700 + JetBrains Mono) wired into CSS vars.

Stage Summary:
- E2E verified via agent-browser: register → login → create subject (incl. empty + duplicate validation errors) → live recording (timer + mic-warning fallback) → processing pipeline w/ live % + stage names → completed markdown notes (headings/tables/code/blockquotes render correctly) → file upload flow w/ real WAV → FAILED → Retry → COMPLETED → GitHub connect (status/reconnect/disconnect + View on GitHub link) → logout → login persistence → mobile layout (topbar + bottom tabs) → tablet icon-only sidebar.
- Lint: clean (0 errors, 0 warnings). Dev server: no runtime errors in dev.log.
- Note: agent-browser daemon intermittently stops delivering input events (fixed by browser restart; app code was never at fault — verified via JS-dispatched events each time).

Unresolved issues / risks:
- agent-browser input flakiness (tooling, not app) — future QA rounds should restart browser when clicks stop registering.
- Audio payloads are discarded server-side (simulation); real transcription would need ASR integration.
- GitHub OAuth is simulated (sandbox has no callback URL); UI is production-ready for a real flow swap.

Next-phase priorities (for the recurring webDevReview):
1. ~~Search/filter across subjects & lectures~~ ✅ done in round 2 (command palette)
2. ~~Markdown export/copy button~~ ✅ done in round 2 (Copy MD + Download .md)
3. ~~Editable lecture titles; re-generate notes action~~ ✅ done in round 2
4. ~~Keyboard shortcuts + command palette~~ ✅ done in round 2
5. ~~Statistics dashboard~~ ✅ done in round 2
6. Optional: real ASR hook via z-ai-web-dev-sdk ASR skill in the audio upload route.

---
Task ID: 2-a
Agent: webDevReview (recurring cron)
Task: Round 2 — QA regression pass + implement top next-phase features: global search command palette, keyboard shortcuts, markdown copy/download, lecture rename, notes regeneration, statistics dashboard. Plus styling refinements.

Work Log:
- QA pass first: restored session, verified subjects grid + lecture detail + processing all working (no regressions from round 1).
- Backend additions:
  - `GET /api/search?q=` — global search across subject names + lecture titles (case-insensitive contains); empty query returns recents (4 subjects + 6 lectures) so the palette is useful on open.
  - `GET /api/stats` — aggregated KPIs (totalSubjects/Lectures/DurationSeconds, completed/failed/processing, completionRate, firstLectureAt), per-subject breakdown, 6 recent lectures; syncs in-flight processing first.
  - `PATCH /api/lectures/[id]` — rename with validation (non-empty, ≤120 chars).
  - `POST /api/lectures/[id]/regenerate` — re-runs pipeline for COMPLETED/FAILED lectures; increments `regenCount` which rotates the markdown template so regenerated notes differ from the original draft.
  - Prisma schema: added `regenCount Int @default(0)` to Lecture; `generateMarkdown` now hashes id + regenCount.
- Frontend additions:
  - `CommandPalette.tsx` — Linear-style ⌘K palette: debounced search, grouped results (Actions / Subjects / Lectures), arrow-key + Enter navigation, kbd footer hints, active-item scroll-into-view, Esc/overlay close, status pills inline for lectures.
  - `use-keyboard-shortcuts.ts` — global shortcuts: ⌘K/Ctrl+K/`/` open palette (palette works even while typing); `g`-prefix sequences `g s` (subjects), `g r` (record), `g t` (stats), `g g` (settings); all suppressed while typing in inputs.
  - `StatsView.tsx` — KPI cards (lectures, hours recorded, completion rate, last activity) with tabular-nums; "By subject" rows with proportional wine-gradient bars; recent activity list; skeleton loading; empty state.
  - LectureDetail upgrades: inline rename (pencil → input → Enter/Esc, PATCH), Copy MD (clipboard + "Copied" feedback + toast), Download .md (slugified filename, blob download), Regenerate notes (COMPLETED/FAILED only).
  - Layout: Statistics added to sidebar nav + mobile bottom tabs (4 tabs); sidebar search trigger with platform-aware kbd hint (⌘K vs Ctrl K); mobile topbar search button.
- Styling refinements (globals.css +~400 lines): `.kbd` key chips, `.sidebar-search`/`.topbar-search` triggers, full palette component styles (overlay, input row, groups, items, footer), stat cards/labels/values, subject-stat bar rows, `.icon-btn`, `.rename-box`, `.meta-action-grid` (Copy/Download grid), `.btn-sm`, subtle `.page-enter` fade-in (160ms), responsive rules (icon-rail sidebar search, 2-col mobile stat grid, simplified mobile stat rows, palette top offset), all respecting existing hairline-border/no-gradient-except-stat-bar design language.
- Infra incident + fix: added `regenCount` to schema but the running dev server had a stale Turbopack cache of the Prisma client → `regenerate` 500 (`Unknown argument regenCount`). Fixed by clearing `.next` and restarting the dev server. NOTE: background processes die when the bash tool session ends — use the double-fork pattern `(setsid bun run dev < /dev/null > /tmp/dev-server.log 2>&1 &)` which survives across tool calls.
- E2E verified via agent-browser: Ctrl+K opens palette (8 items: 4 actions + 1 subject + 3 lectures) → typed "fourier" → filtered to exact lecture → ArrowDown+Enter navigated to it; rename ("…& Applications") persisted across reload AND through regeneration; Copy MD → toast + button flips to "Copied"; Download → toast; Regenerate → processing panel at 8% → completed with ROTATED template (Overview→Session Summary h2s); stats page (3 lectures, 52m, 100%, since Aug 22) + subject row + 3 recent; shortcuts g+s / g+r / g+t / `/` all verified; mobile stats 2-col grid + 4 tabs; desktop regression sweep clean. VLM review: "highly polished… successfully emulating the Linear aesthetic… no visual glitches."
- Lint: clean (0 errors, 0 warnings). dev.log: no errors; all new endpoints 200.

Stage Summary:
- All 5 next-phase priorities from round 1 are now implemented and E2E verified. The app now has: command-palette global search, Linear-style keyboard shortcuts, full lecture lifecycle actions (rename/copy/download/regenerate), and a statistics dashboard.
- Dev server: restarted via detached double-fork; Prisma client cache issue resolved.

Unresolved issues / risks:
- agent-browser input flakiness persists (restart browser when clicks silently fail).
- Dev server must stay running; if it dies, restart with: `cd /home/z/my-project && (setsid bun run dev < /dev/null > /tmp/dev-server.log 2>&1 &)` and wait ~15s.
- GitHub OAuth + ASR remain simulations (production swap points).

Next-phase priorities (for the next webDevReview):
1. Subject detail: search/filter + sort lectures; batch actions (delete multiple).
2. Subjects page: subject editing (rename/description) and better long-list handling (pagination or virtual scroll when >20 subjects).
3. Record page: pause/resume recording; live waveform or level meter; recording session naming after stop.
4. Markdown editor mode: view source toggle for power users; anchor links/outline sidebar for long notes (TOC).
5. Stats: bar chart of lectures per week/month (pure CSS or SVG, no chart lib needed for the aesthetic).
6. Real ASR integration via z-ai-web-dev-sdk in the audio route (optional big win).

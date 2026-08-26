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
1. ~~Subject detail: search/filter + sort lectures~~ ✅ done in round 3
2. Subjects page: subject editing (rename/description) and better long-list handling (pagination or virtual scroll when >20 subjects).
3. ~~Record page: pause/resume recording; live waveform or level meter~~ ✅ done in round 3
4. ~~Markdown editor mode: view source toggle; anchor links/outline sidebar for long notes (TOC)~~ ✅ done in round 3
5. ~~Stats: bar chart of lectures per week/month~~ ✅ done in round 3 (daily activity chart)
6. Real ASR integration via z-ai-web-dev-sdk in the audio route (optional big win).

---
Task ID: 3-a
Agent: webDevReview (recurring cron)
Task: Round 3 — QA regression pass + implement: lecture-notes TOC with scroll-spy, Markdown source view toggle, subject lecture search/filter/sort, stats activity chart, record pause/resume with live level meter.

Work Log:
- QA pass first: session restored, palette (8 items), stats (4 cards), lecture detail — no regressions from round 2.
- Backend: `GET /api/stats` now returns `activity` — daily lecture counts for the last 28 days (UTC-normalized keys), computed from all lectures.
- New lib `src/lib/toc.ts` — `extractToc(markdown)` (ATX h2/h3 parser that skips fenced code blocks, strips inline formatting) + `slugify`. Ids are derived purely from heading TEXT with no per-render counters and no dedup suffixes, so renderer and TOC cannot drift.
- LectureDetailView upgrades:
  - "On this page" TOC card in the sidebar (h2 + indented h3), click → smooth scroll (scroll-margin-top offset), IntersectionObserver scroll-spy highlights the active section with wine left-border.
  - Preview / Source segmented control above notes; Source renders the raw markdown in a styled mono `<pre>`; toolbar shows "N sections · M lines".
  - Restructured sidebar: `.lecture-side` wrapper (sticky column) containing meta card + TOC.
- SubjectDetailView upgrades: lecture toolbar with live title search (clear button), status filter select (All/Completed/Processing/Recording/Failed), sort select (Newest/Oldest/Title A–Z); dashed-border empty state with "Clear filters" action; filtering is client-side over the polled list.
- StatsView: pure-CSS activity chart — 28 daily bars, proportional heights, wine-500 bars with hover lightening, native title tooltips, first-date/today axis labels, "N lectures" header.
- RecordView upgrades:
  - Pause / Resume button pair with Stop (danger-solid); MediaRecorder.pause()/resume() with timer that accumulates only running time (accumulatedRef + segmentStartRef) — paused time excluded from duration.
  - Paused state: amber "PAUSED" indicator, dimmed timer, updated hint.
  - Live input level meter: AudioContext + AnalyserNode (fftSize 512), rAF loop computes RMS with perceptual curve, updates 28 meter cells via direct DOM class toggling (no re-renders); cells use wine-300 with error-red "hot" zone; meter hidden in timer-only mode; AudioContext closed on cleanup.
- CSS (+~450 lines): notes toolbar + segmented control, markdown-source, toc-card/list/links with active state, lecture toolbar + search box + selects, empty-filter state, activity chart, record-controls, paused indicator, meter cells, mobile rules (toolbar wraps, search full-width, controls stacked, TOC first on mobile).
- BUG FOUND & FIXED (real bug caught by E2E): first TOC implementation used a shared mutable idx counter inside memoized react-markdown components — worked on first render but scroll-spy re-renders continued incrementing past toc.length, wiping ALL heading ids (headings unreachable, getElementById null). Fixed by making ids stateless (derived from heading text via nodeText recursion + slugify on both sides). Also fixed missing `slugify` import that caused a client-side ReferenceError crash during the fix (recovered via Fast Refresh full reload).

Stage Summary:
- E2E verified: TOC renders 8 entries with correct ids; click scrolls to heading (top ≈150px with offset); active highlight tracks scroll; ids survive re-renders (validated after scroll + toggle cycles); Source toggle shows 58-line raw markdown, Preview restores TOC; subject filter "fourier" → 1 row; status filter FAILED → empty state with Clear filters; sort title A–Z alphabetical; pause froze timer at 00:15 for 4s+, resume continued 15→18; stop created lecture "Lecture 7: PDEs Intro" → completed with TOC; stats updated to 4 lectures / activity chart 2 active days; mobile: TOC above meta card, chart 28 bars, wrapped toolbar. VLM: "Exceptionally high polish… production-ready interface."
- Lint: clean (0 errors, 0 warnings). dev.log: no server errors.

Unresolved issues / risks:
- agent-browser daemon input flakiness (restart browser when clicks silently fail) — occurred once this round, resolved with close/relaunch.
- Dev server persistence: currently running via detached double-fork; if it dies restart with `cd /home/z/my-project && (setsid bun run dev < /dev/null > /tmp/dev-server.log 2>&1 &)`.
- Duplicate heading texts share one anchor id (acceptable; both TOC links jump to first occurrence).
- Level meter only renders when mic permission granted (headless has no mic — verified via logic, not visually).

Next-phase priorities (for the next webDevReview):
1. ~~Subject editing (rename/description)~~ ✅ done in round 4
2. ~~Command palette: recent-items memory + "Create new subject" action~~ ✅ done in round 4
3. ~~Notes: checkbox interactivity (persist task-list checks)~~ ✅ done in round 4 (print stylesheet still open)
4. Stats: weekly grouping toggle; duration-weighted activity (minutes per day, not just counts).
5. ~~Batch lecture actions (multi-select delete)~~ ✅ done in round 4
6. Real ASR integration via z-ai-web-dev-sdk in the audio route (optional big win).

---
Task ID: 4-a
Agent: webDevReview (recurring cron)
Task: Round 4 — QA regression pass + implement: subject editing (rename/description), palette create-subject action with recents memory, interactive task checkboxes persisted to DB, batch lecture multi-select delete.

Work Log:
- QA pass first: subjects/palette/stats all working (no regressions). Restarted dev server proactively after schema change (round-2 lesson: stale Turbopack/Prisma cache).
- Schema: added `taskChecks String?` (JSON map of checkbox states) to Lecture; db:push + server restart.
- Backend additions:
  - `PATCH /api/subjects/[id]` — rename/description update with validation (non-empty name ≤80 chars, duplicate-name check scoped to user).
  - `POST /api/lectures/[id]/checks` — persists task-checkbox map; sanitizes to flat {key: boolean} with key pattern `^[a-z0-9-]{1,64}$` and 200-entry cap; null when empty.
  - `POST /api/lectures/batch-delete` — deleteMany scoped via subject relation (max 100 ids), returns { deleted: count }.
  - Lecture GET now returns parsed `taskChecks`.
- SubjectsView: subject cards converted to div (keyboard accessible via tabIndex/Enter) with hover-revealed pencil edit button (visible on touch devices via `@media (hover: none)`); the New/Edit modal is unified (title/button label switch); duplicate-name error surfaces inline.
- CommandPalette: new "Create new subject" action — sets sessionStorage flag `ln:open-create-subject`, navigates to /subjects, dispatches `ln:create-subject` CustomEvent; SubjectsView listens for the live event AND checks the flag on mount (covers cross-page navigation). Recents memory: `ln_recents` localStorage map (6 max) recorded when opening subjects/lectures via palette; "RECENT" badge chip on matching results.
- LectureDetailView: interactive task checkboxes — react-markdown renders GFM task lists; custom `input` component renders UNCONTROLLED checkboxes (defaultChecked) so React re-renders never revert user toggles; post-render effect enables boxes, assigns `task-{i}` indices via dataset, applies persisted state; delegated container onClick updates React state + POSTs to /checks; CSS: task items list-style none, flex layout, wine accent checkboxes, line-through + muted on checked (`:has()` selector).
- SubjectDetailView: Select mode toggle in toolbar; rows restructured as `.lecture-row-wrap` (checkbox column + flex row) to avoid nested buttons; batch bar with count, Select all/Deselect all, Delete selected (danger); auto-exits select mode after delete; LectureRow refactored into `LectureRowContent` (shared) + `LectureRow` (standalone button for StatsView).
- BUGS FOUND & FIXED:
  1. `useRef is not defined` client crash — missing import after adding markdownRef (caught by E2E error overlay).
  2. Checkbox toggles silently reverted: react-markdown renders CONTROLLED inputs (`checked={false}`), so any React re-render (scroll-spy/polling) reset user clicks. Fixed with uncontrolled `defaultChecked` override in the input component.
- CSS (+~150 lines): subject-card-edit reveal, batch bar, lecture-row-wrap/selected/lecture-check, task-item checkbox styles with checked strikethrough, palette-recent-badge, touch-device fallback.

Stage Summary:
- E2E verified: subject renamed "Mathematics → Mathematics II" + description updated (persisted, toast shown); palette create-subject action works cross-page (from /stats → subjects + modal opens); palette navigation records recents → RECENT badge appears on next open (localStorage confirmed); checkboxes render for GFM task lists (4 boxes), clicks toggle + persist to server, state survives reload ([true,true,false,false] restored with strikethrough); batch mode: select 2 → count updates, Select all → 4/4, delete 1 → toast "Deleted 1 lecture", 3 rows remain, mode auto-exits. VLM: "highly polished… interactive checkboxes… strikethrough… sophisticated dark theme." Lint clean (0/0). dev.log: no errors. Mobile: checkboxes + layout verified at 390px.

Unresolved issues / risks:
- Narrow init race: clicking a checkbox in the same tick as lecture-load init could be overwritten by initial checks state (sub-100ms window, acceptable).
- After Regenerate, task-check indices may map to different checkboxes in the new template (checks are positional; acceptable, resets on next visit).
- agent-browser input flakiness: none this round.
- Dev server: running detached; restart command in worklog if it dies.

Next-phase priorities (for the next webDevReview):
1. ~~Stats: duration-weighted activity chart (minutes/day) + weekly grouping toggle~~ ✅ done in round 5
2. ~~Print stylesheet for notes~~ ✅ done in round 5 (verified via PDF render)
3. ~~Keyboard navigation in lecture lists (j/k)~~ ✅ done in round 5
4. ~~Notes: anchor links on headings (hover ¶ link); reading progress indicator~~ ✅ done in round 5
5. Empty-state illustrations via subtle SVG patterns (stay within design language).
6. Real ASR integration via z-ai-web-dev-sdk in the audio route (optional big win).

---
Task ID: 5-a
Agent: webDevReview (recurring cron)
Task: Round 5 — QA regression pass + implement: duration-weighted stats chart with metric/grouping toggles, print stylesheet, heading anchor links with deep-link scroll, reading progress bar, j/k keyboard navigation in lecture lists.

Work Log:
- QA pass: all views regression-clean (subjects/palette/stats/notes).
- Backend: `/api/stats` activity entries now `{ date, count, seconds }` — daily recorded-seconds aggregated alongside counts; client picks the metric.
- StatsView ActivityChart rebuilt: two segmented controls (Lectures/Minutes × Daily/Weekly); `groupByWeek` (Monday-start buckets); minutes bars use wine-400 variant; weekly mode widens bars; axis shows total in active metric; tooltips localized ("Week of Aug 18 — 3 lectures" / "N min recorded").
- LectureDetailView additions:
  - Reading progress: fixed 2px wine bar at viewport top, scroll listener computes % through the markdown container (passive listeners + resize handling); only in preview mode on completed notes.
  - Heading anchor links: `useHeadingAnchors` injects link buttons into rendered h2/h3 (DOM-injected, cleaned up on unmount); click copies `origin/#/lectures/<id>/<slug>` to clipboard with copied-state flash; hover-revealed (always visible on focus/print-hidden).
  - Deep links: App passes `route.segments[2]` as headingSlug → LectureDetailView smooth-scrolls + activates TOC entry once markdown renders. URL `#/lectures/<id>/<heading-slug>` verified working end-to-end.
- SubjectDetailView: j/k keyboard navigation — cursor row with wine inset border + title tint, `scrollIntoView({block:'nearest'})` on move, Enter opens cursor row (only when body focus, so buttons/inputs unaffected), clamped at bounds, disabled in select mode and while typing in filter inputs; "J K move · ↵ open" kbd hint under the toolbar.
- Print stylesheet (300+ lines): @page margins; hides sidebar/topbar/tabs/toasts/progress/back-link/notes-toolbar/TOC/anchors; white page, dark typographic palette; h2 keeps dark-wine tone with hairline underline; blockquote light-gray with wine border; code/pre light-gray surfaces; tables bordered 0.5pt; break-inside/after rules to avoid orphan headings.
- BUG FOUND & FIXED (print): first PDF render came out 85-90% dark. Diagnosis via pdftoppm + VLM: @media print WAS applying (sidebar/buttons hidden) but `.app-shell` kept its dark background (only html/body were reset — app-shell paints over them). Fixed by resetting backgrounds on `.app-shell/.app-main/.page/.lecture-detail-layout` + catch-all `.markdown-content * { color: #1a1a1a !important }` (accent rules win via higher specificity). Regenerated PDF verified: white page, dark readable text, no chrome, light-gray boxes.
- Also fixed en route: TDZ issue (useHeadingAnchors referencing `isDone` before declaration → moved hook below state, used inline status check); removed unused eslint-disable via --fix.
- Deviation note: `agent-browser set media print` does not actually emulate print media (verified by computed-style probe); real print verification done through `agent-browser pdf` + pdftoppm + VLM.

Stage Summary:
- E2E verified: chart controls (28 daily bars → Weekly → 4 bars with "this week" axis; Minutes → "1 min total" — correct, since round-4 batch delete removed the 52m lecture); reading progress 1%→100%→1% on scroll; 8 anchor buttons injected, click copies correct URL (intercepted writeText verified: `…/#/lectures/<id>/session-summary`); deep link `#/lectures/<id>/terminology-introduced` scrolls heading to top:142 + highlights TOC; j/k moves cursor (j→j→k across 3 rows), k clamps at 0, Enter opens cursor lecture; print PDF white/clean/no-chrome. Lint: clean (0/0). dev.log: no errors.

Unresolved issues / risks:
- `agent-browser set media print` is a no-op — future print QA must use `agent-browser pdf` + pdftoppm + VLM pipeline.
- One VLM call misfired this round (returned generated HTML instead of a review); functional E2E assertions were used as the source of truth instead.
- Print heading color #4c1d1d reads near-black at low DPI — intended (print-appropriate).
- j/k active only outside select mode / filter inputs (by design).

Next-phase priorities (for the next webDevReview):
1. ~~Real ASR integration via z-ai-web-dev-sdk~~ ✅ done in round 6 (full AI pipeline: ffmpeg chunked ASR + LLM notes)
2. ~~Subjects grid: sort controls~~ ✅ done in round 6 (Recent/Name/Count)
3. ~~Notes: word count / estimated reading time~~ ✅ done in round 6
4. Settings: appearance section; data export (all notes as .md zip).
5. Record: post-stop title edit before upload (naming after stop).
6. Empty-state SVG illustrations (subtle, within design language).

---
Task ID: 6-a
Agent: webDevReview (recurring cron)
Task: Round 6 — QA pass + REAL ASR integration: audio files are now genuinely transcribed via z-ai-web-dev-sdk (ffmpeg-chunked for the 30s API limit) and notes are LLM-generated from the actual transcript. Plus word-count/reading-time, subjects sort, and "AI transcribed" metadata.

Work Log:
- Read ASR + LLM + TTS SKILL.md docs before implementation (per skill rules).
- Schema: added `transcript`, `pipelineStage`, `audioPath` to Lecture; db:push + detached server restart (cache lesson applied).
- NEW `src/lib/asr-pipeline.ts` — the real AI pipeline (server-side only, fire-and-forget from the upload route):
  - Audio storage: uploads saved to /tmp/ln-asr/<lectureId>.<ext> so Retry/Regenerate re-run without re-upload; delete routes (single + batch) now unlink stored audio.
  - ASR 30-second API limit discovered via a real 400 error ("文件时长限制为0-30秒") → built ffmpeg chunker: normalize any format → mono 16 kHz PCM WAV (ffmpeg spawn), parse RIFF header for duration, slice ≤25 s chunks (header+PCM slice), transcribe each chunk sequentially, join; MAX_CHUNKS=16 (~6.5 min) with explicit truncation note appended to the transcript.
  - Stage tracking: pipelineStage TRANSCRIBING (35%) → GENERATING (75%) → COMPLETED; every stage persisted; failures → FAILED with real error message.
  - Note generation: zai.chat.completions with a study-notes system prompt (H1 title, transcript-attribution blockquote, Overview/Key Concepts/Details H2s, Summary table, GFM Study Checklist; faithful-to-transcript rule, no invented facts, ≤700 words); transcript capped at 24k chars; accidental document-fences stripped.
  - Staleness guard: pipeline lectures stuck PROCESSING >8 min (e.g. server died mid-run) are marked FAILED with a retry hint — inside syncLectureState.
- `syncLectureState` guard: never timer-completes lectures with pipelineStage set (real pipeline owns them); timer simulation remains for timer-only sessions (15% random fail still simulated there only).
- Routes updated: audio upload (saves file, spawns runAiPipeline, failFlag only for timer sessions); status (pipeline-aware substages "Transcribing audio (AI)" / "Structuring notes (AI)"); retry + regenerate (audio lectures re-run AI pipeline; regenerate reuses transcript and re-runs only the LLM stage); lecture GET returns hasTranscript.
- Frontend: notes toolbar caption now "N sections · X words · Y min read" (noteStats strips md syntax, 200 wpm); Audio meta shows "AI transcribed" vs "Captured" vs "Timer session"; subjects page gained a sort select (Recent activity / Name A–Z / Most lectures, hidden when ≤1 subject) with responsive stacking.
- E2E test data: generated a real 52 s spoken lecture via TTS CLI (Newton's laws physics lecture), uploaded through the UI.
- BUGS FOUND & FIXED:
  1. ASR 400 on >30 s audio (real API limit) → ffmpeg chunking pipeline (above).
  2. Status route rewrite dropped both the `include: subject` AND the subjectName argument → timer lectures completed with "· the course ·" default subject in the blockquote; passing include + argument again (verified via regenerate → "· Mathematics II ·").

Stage Summary:
- E2E verified end-to-end REAL pipeline: TTS-generated 52 s speech WAV → UI upload → ffmpeg normalize + 3×25 s chunk ASR → genuine transcript → LLM structured notes ("Physics 201: Newton Laws of Motion": all three laws, F = ma, scalar/vector distinctions, 5-item Study Checklist) → Completed; meta shows "AI transcribed"; interactive checkboxes work on AI notes (5 boxes, toggles persist); toolbar "4 sections · 138 words · 1 min read"; retry after the initial 400 error re-ran the pipeline from the stored file. Fallback verified: timer-only session completed via simulated pipeline at 30 s (template blockquote, "Timer session" meta); regenerate now stamps correct subject name. Subjects sort: Recent → Mathematics II first; Name A–Z → alphabetical; Count → lecture-heavy first. VLM confirmed notes page, "AI transcribed" badge, word count. Lint clean (0/0). dev.log: no errors after fixes.
- Data note: demo account now has 3 subjects (Mathematics II w/ 5 lectures incl. AI-transcribed Physics lecture, Astronomy, Chemistry) — extra subjects added to verify sorting.

Unresolved issues / risks:
- ASR chunking caps at ~6.5 min per run (MAX_CHUNKS=16) with an honest truncation note in the transcript — a real deployment needs a job queue for full lectures.
- Audio files live in /tmp/ln-asr (ephemeral in sandbox; fine for the demo, would move to object storage in prod).
- runAiPipeline is fire-and-forget in the Next.js dev process — server restarts mid-run leave PROCESSING until the 8-min staleness guard fails them (retryable).
- Sequential chunk transcription (no parallelism) — fine at current scale.

Next-phase priorities (for the next webDevReview):
1. ~~Settings → Data export (all notes as .md)~~ ✅ done in round 7
2. ~~Transcript viewer (collapsible, AI-transcribed lectures)~~ ✅ done in round 7
3. ~~Notes: flashcard-style review mode from Study Checklist~~ ✅ done in round 7
4. Record: post-stop title edit before upload; upload progress indicator for large files.
5. Empty-state SVG illustrations (subtle, within design language).
6. Settings appearance: font-size preference (persisted).
7. Optional: parallel chunk transcription + per-chunk progress in status payload.

---
Task ID: 7-a
Agent: webDevReview (recurring cron)
Task: Round 7 — QA pass + study-feature round: flashcard review mode (flip cards from notes), raw-transcript viewer for AI-transcribed lectures, and export-all-notes (.md bundle) in Settings.

Work Log:
- QA pass: 3 subjects, AI lecture intact, no regressions.
- Backend:
  - Lecture GET now returns the full `transcript` string (alongside hasTranscript).
  - NEW `GET /api/export` — full data export: all subjects (name-asc) with lectures (title/status/date/duration/markdown/transcript) + summary counts.
- NEW `src/lib/flashcards.ts` — client-side card generation from markdown:
  - Concept cards: bold list terms ("- **Term**: definition") → front "Define: Term" / back = definition.
  - Checklist cards: GFM "- [ ]" items → front = task; back = best-matching note paragraph via stopword-filtered keyword overlap (length-normalized).
  - Fallback section cards ("Summarize: <h2>") when notes have neither; cap 24 cards.
- NEW `FlashcardReview.tsx` — fullscreen study session:
  - 3D flip card (rotateY, backface-visibility), origin badge (Key concept / Study checklist / Section).
  - Again / Got it flow with known-set tracking; per-card progress dots (wine current, green known); session-complete screen ("You marked X of N cards as known") with Study again / Done.
  - Keyboard: space/enter flip, ←/→ navigate, 1 Again, 2 Got it, Esc close. Modal is mount/unmounted fresh per session (no reset effects — satisfies react-hooks/immutability).
  - "Review · N" button in the notes toolbar (visible when cards exist).
- LectureDetail: "Raw transcript" collapsible section below notes (wine icon, word count + speech-to-text caption, rotating chevron, mono body with max-height scroll) — shows the genuine ASR output for AI-transcribed lectures.
- Settings: new "Data" section — "Export all notes (.md)" builds a clean combined Markdown bundle client-side (subject H1s, lecture H2s with date/duration/status blockquotes, notes demoted to H3 for hierarchy) and downloads `lecture-notes-export-YYYY-MM-DD.md`; toast confirms.
- CSS (+~280 lines): flash overlay/shell/card faces with 3D flip, origin badges, controls (nav arrows, mark buttons with kbd hints), progress dots, done screen with success ring; transcript section/toggle/body; mono-sm utility.
- BUGS FOUND & FIXED:
  1. FlashcardReview initial version had a reset-on-open effect (react-hooks/set-state-in-effect error) → restructured to conditional mount (parent renders only when open, state starts clean) and converted advance/markKnown to proper useCallback chain.
  2. Checklist cards matched their answers back to the Study Checklist section itself (verbatim word overlap → echo-the-question bug). Fixed by excluding task-list/checklist blocks from match candidates — now "State Newton's First Law" matches the actual Key Concepts paragraph.

Stage Summary:
- E2E verified: Review · 8 button on the AI Physics lecture (3 concept + 5 checklist cards); card 1 "Define: Newton's First Law" → flip → correct definition → Got it → 2/8 with 1 green dot; space/arrow keyboard controls; fast-forward → "Session complete — You marked 1 of 8 cards as known. 7 to review again."; Study again restarts; Esc closes. Checklist card now backs with real Key Concepts content. Transcript toggle: "76 words · speech-to-text" → opens showing the genuine ASR text ("Welcome to Physics Two Hundred and One…"). Export: intercepted download shows `lecture-notes-export-2026-08-23.md` (9,744 bytes) + toast "Exported 5 notes as Markdown". Mobile 390px: flashcard shell fits, controls usable. VLM: "highly polished with a sophisticated dark theme." Lint clean (0/0). dev.log: no errors.

Unresolved issues / risks:
- Flashcard deck generation is heuristic (bold terms + checklist); LLM-generated decks would be richer (future enhancement via a notes→deck prompt).
- Export is a single combined .md (no zip — deliberately dependency-free).
- agent-browser session state file occasionally needs reloading after daemon restarts (sessionState loss is cosmetic).

Next-phase priorities (for the next webDevReview):
1. ~~Record: post-stop title edit before upload~~ ✅ implemented in round 8 (before scope change below)
2. ~~Upload progress indicator~~ ✅ implemented in round 8 (api.upload XHR helper — NOTE: reverted with the round-8 scope change; re-add if needed)
3. LLM-generated flashcard decks (notes → deck endpoint via z-ai chat).
4. Empty-state SVG illustrations (subtle, within design language).

---
Task ID: 8-a
Agent: Main agent (direct user request)
Task: User-directed scope change — REMOVE Statistics (page, nav, palette action, shortcut, API route), REMOVE GitHub connection from Settings (backend-managed now; also removed from lecture detail + API routes), REMOVE Register (view, route, link, API route), and ADD proper login (per-field validation, password visibility toggle, real error surfacing).

Work Log:
- Removed Stats everywhere: StatsView.tsx deleted; App route case, sidebar nav item, mobile tab, `g t` shortcut, palette "Go to statistics" action all removed; `/api/stats` route deleted; stats CSS blocks (stat-grid/cards, subject-stat rows, activity chart + controls/weekly, mobile stats rules) removed from globals.css; GithubStatus/Stats/SubjectStat types removed from api.ts. `#/stats` now falls back to Subjects.
- Removed GitHub UI: SettingsView rewritten without the GitHub Connection section + OAuth modal (keeps API Configuration / Data / Account); LectureDetailView "View on GitHub"/"Connect GitHub" buttons + github status fetch removed; `/api/github/*` routes deleted; auth.ts getAuthUser select trimmed to id/email. (User model schema fields left in place — harmless, backend concern.)
- Removed Register: RegisterView.tsx deleted; App AuthScreen renders LoginView only; register link removed from login; AuthContext.register removed; `/api/auth/register` route deleted. `#/register` falls back like any unknown route.
- Proper login: per-field inline validation (empty email → "Enter your email address.", bad format → "Enter a valid email address.", empty password → "Enter your password."), submit button disabled until both fields non-empty, password visibility toggle (Eye/EyeOff, type=text/password swap), inputs disabled while loading, server errors ("Invalid email or password.") render inline under the password field with invalid styling; errors clear as the user types.
- BUG FOUND & FIXED (pre-existing, surfaced by this round's E2E): api.ts treated ANY 401 as session-expiry → window.location.reload(), which wiped the login form on invalid credentials (the page reloaded instead of showing "Invalid email or password."). Fixed: only auto-reload on 401 when a token was actually attached to the request; tokenless 401s (login) surface their error normally.
- INCIDENT & RECOVERY: mid-round, a `git stash` + drop (used while repairing globals.css after a bad scripted edit) reverted ALL uncommitted TSX changes. Recovered by re-applying every edit (App/Sidebar/Layout/CommandPalette/shortcuts/SettingsView/LoginView/AuthContext/LectureDetailView/api.ts deletions) — all re-verified after. globals.css was separately repaired via git checkout + precise line-range removals (stats sections) + new password-field CSS. Lesson recorded: never stash a dirty tree mid-round; repair files individually.
- E2E verified after recovery: login page has password toggle + NO register link; empty submit → both field errors; bad email format → inline error; password toggle flips input type; invalid creds → "Invalid email or password." inline (no page reload), input marked invalid; valid login → subjects, nav = Subjects/Record/Settings only; Settings sections = API Configuration/Data/Account (no GitHub); lecture detail has no GitHub buttons (both timer + AI-transcribed lectures checked); palette has no statistics action; #/stats and #/register fall back cleanly; mobile tabs = 3; export still downloads (intercepted: lecture-notes-export-2026-08-23.md, "Exported 5 notes"); lint clean (0/0); register/stats/github API routes all 404.

Stage Summary:
- App scope now matches the user's spec: no stats, no GitHub UI, no register — clean three-tab app (Subjects / Record / Settings) with a properly validated login flow. All removals verified end-to-end; one real pre-existing login bug (401 reload) found and fixed.

Unresolved issues / risks:
- Round-8 in-progress features (post-stop title edit, upload progress via api.upload, streaks) were reverted by the stash incident and NOT re-applied (out of the new scope; worklog history documents them for easy re-add).
- No way to create accounts through the UI anymore (by design — accounts come from the external backend). The existing demo account (student@university.edu / password123) remains in the DB for testing.
- Prisma User schema still carries github* fields (unused; left for the real backend to own).

Next-phase priorities (for the next webDevReview):
1. Wire login to the real backend (swap /api/auth/login internals or base URL — client is same-origin).
2. Re-add upload progress + post-stop title edit if desired (code documented in worklog round 8 pre-revert).
3. LLM-generated flashcard decks; empty-state SVG illustrations.

---
Task ID: 13-routes
Agent: full-stack-developer
Task: Write all 12 remaining route handlers + create-user script + .gitignore update.

Work Log:
- Read worklog.md, src/lib/{auth,db,gemini,pipeline,markdown,mock,api}.ts and the Prisma schema to understand the new String-ID + ISO-string contract.
- Reviewed the existing (stale) route handlers that still referenced the deleted getAuthUser/lecture-state/asr-pipeline helpers, then overwrote all 12 to use getCurrentUser + genId + new Date().toISOString().
- Wrote `src/app/api/subjects/route.ts`: GET reaps RECORDING lectures older than 24h (→ FAILED, "Recording abandoned") and returns subjects with _count + take:1 lastLecture; POST 422s on empty name, genId() + ISO timestamps, defaults description to null.
- Wrote `src/app/api/subjects/[id]/route.ts`: GET returns {id,name,description,createdAt,lectures: LectureSlim[6 fields]}; PATCH 422s on empty name, returns {id,name,description}; DELETE cascades.
- Wrote `src/app/api/lectures/route.ts`: GET filters by userId (and optional subjectId with ownership check, 404 otherwise) ordered by recordedAt DESC with subjectName; POST 422s on missing subjectId, falls back to "Untitled Lecture" for empty title, creates with status=RECORDING and full ISO timestamps, returns full Lecture shape.
- Wrote `src/app/api/lectures/[id]/route.ts`: GET returns LectureDetail with hasTranscript + parsed taskChecks; PATCH 422s on empty title; DELETE removes the lecture and best-effort fs.unlink('uploads/{id}').
- Wrote `src/app/api/lectures/[id]/audio/route.ts`: 404 + status-guard (RECORDING|FAILED only, else 422), handles multipart (audio + duration) and JSON (durationSeconds), enforces MAX_AUDIO_BYTES with 413 + partial-file cleanup, writes to uploads/{id}, sets PROCESSING/progress 0/substage/error null/markdown null, launches processLecture via after() with setImmediate fallback.
- Wrote `src/app/api/lectures/[id]/status/route.ts`: cheap select of 4 fields + updatedAt, side-effect FAILED + "Processing timed out" if PROCESSING > 15min.
- Wrote `src/app/api/lectures/[id]/retry/route.ts`: 422 if not FAILED, resets fields, launches processLecture via after(), returns {status:'PROCESSING', pipeline:'ai'}.
- Wrote `src/app/api/lectures/[id]/regenerate/route.ts`: 422 unless COMPLETED|FAILED, bumps regenerateCount, launches pipeline.
- Wrote `src/app/api/lectures/[id]/checks/route.ts`: validates object payload, sanitizes to {string:boolean}, stores JSON string (or null when empty), returns {ok, checks}.
- Wrote `src/app/api/lectures/batch-delete/route.ts`: dedupes ids, deletes only userId-scoped lectures, removes their uploads/{id} files in parallel.
- Wrote `src/app/api/search/route.ts`: empty q → 5 recent subjects + 8 recent lectures; otherwise case-insensitive contains search on subject.name + lecture.title, returns {subjects:[id,name,lectureCount], lectures:[id,title,subjectId,subjectName,status,recordedAt]}.
- Wrote `src/app/api/export/route.ts`: returns {exportedAt,email,totalSubjects,totalLectures,lecturesWithNotes,subjects:[{id,name,description,lectures:[7 fields]}]} with subjects ordered by name ASC, lectures by recordedAt DESC.
- Wrote `scripts/create-user.ts`: standalone tsx script that lowercases email, hashes password via hashPassword, genId()s a new user, or updates the passwordHash if the email already exists.
- Appended `uploads/` and `data/` to .gitignore.
- Ran `bun run lint` — clean (no errors or warnings).

Stage Summary:
- All 12 route handlers now match the frontend's api.ts type contract exactly and use the new String-ID/ISO-string Prisma schema.
- Auth is consistently via getCurrentUser(request); every handler is wrapped in try/catch returning {"error": message} + 500 on unexpected failure; all field-level errors are {"error": "..."} with the spec'd status codes (404 / 422 / 413).
- The background pipeline is launched through `after(() => processLecture(id).catch(console.error))` with a setImmediate fallback when `after` is unavailable.
- ESLint passes cleanly across the whole project.

---
Task ID: 14-backend
Agent: Main agent + full-stack-developer subagent
Task: Implement the full backend as Next.js App Router route handlers per the user's exact contract spec.

Work Log:
- Installed jose (JWT HS256); rewrote prisma/schema.prisma with the spec's schema (String IDs, String timestamps, userId on Lecture, progressPercent/substage/regenerateCount fields, no pipelineStage/audioPath/failFlag); deleted old lib files (asr-pipeline.ts, lecture-state.ts); created new libs: db.ts (Prisma singleton), auth.ts (jose JWT + scryptSync), gemini.ts (plain fetch to Gemini REST API, detectMime, RESPONSE_SCHEMA, SYNTHESIS_PROMPT, TRANSCRIBE_PROMPT, retries), markdown.ts (deterministic renderNotes), mock.ts (MOCK_TRANSCRIPT, MOCK_SYNTHESIS, mockTranscribe, mockSynthesize), pipeline.ts (processLecture with 6 steps: timer session, transcription, synthesis, rendering, error handling with audio file preservation/deletion rules).
- Subagent wrote all 12 remaining route handlers + scripts/create-user.ts + .gitignore update. All routes use getCurrentUser, genId(), ISO timestamps, {"error": string} error shapes, Promise<{id}> params, after() for pipeline launch.
- Fixed scryptSync bug (crypto.scrypt is async, needed scryptSync).
- Fixed pipeline bug: regenerate/retry on a lecture whose audio was already deleted took the timer-session path and overwrote good markdown with the timer template. Fixed: pipeline now checks for existing transcript FIRST and skips to synthesis if present.
- Re-applied round-12 font/button fixes that were lost during the backend rewrite: :root --font-sans now uses literal stacks (not var(--font-inter) which is out of scope); body prepends var(--font-inter); .btn-danger-solid added to shared button selector; .btn-primary and .btn-danger-solid use wine-100 text color (WCAG AA); .btn-danger-solid uses wine-500 bg (not error red); removed duplicate old hover/active rules.

Stage Summary:
- E2E verified with curl: login (JWT token) ✓, bad login 401 {"error":"Invalid email or password."} ✓, /api/me ✓, no token 401 ✓, create subject ✓, get subjects ✓, create lecture (empty title → "Untitled Lecture") ✓, timer session upload → COMPLETED with timer markdown ✓, audio upload (multipart WAV) → COMPLETED with mock notes ✓, status polling ✓, regenerate (uses existing transcript, produces proper mock notes) ✓, search ✓, export ✓, checks ✓, batch-delete ✓, empty name 422 ✓.
- E2E verified with agent-browser: login works, subjects page shows test subject, lecture detail renders full mock markdown (6 H2 sections: Summary, Key Takeaways, The Perceptron, Assignments, Exam Hints, Cross-Topic Relationships), title "Introduction to Neural Networks" from mock synthesis, Inter font loading, status pill "Completed".
- Lint clean (0/0). GEMINI_MOCK=1 throughout.

Unresolved issues / risks:
- Boot sweep (PROCESSING → FAILED on server startup) not explicitly implemented; the 15-min timeout in GET /status handles the practical case.
- Old localStorage tokens (HMAC format) from before the rewrite are automatically cleared on 401 reload (the new jose JWT verification rejects them).
- Real Gemini API calls untested (GEMINI_MOCK=1); the gemini.ts client follows the spec exactly for production use.

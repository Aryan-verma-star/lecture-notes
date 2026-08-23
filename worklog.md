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
1. Stats: duration-weighted activity chart (minutes/day) + weekly grouping toggle.
2. Print stylesheet for notes (print-optimized, hide chrome).
3. Subject detail: retry/regenerate from row context; keyboard navigation in lecture lists (j/k).
4. Notes: anchor links on headings (hover ¶ link); reading progress indicator.
5. Empty-state illustrations via subtle SVG patterns (stay within design language).
6. Real ASR integration via z-ai-web-dev-sdk in the audio route (optional big win).

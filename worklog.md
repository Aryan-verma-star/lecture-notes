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
1. Search/filter across subjects & lectures; sort options.
2. Markdown export/copy button; print stylesheet.
3. Editable lecture titles; re-generate notes action.
4. Keyboard shortcuts (r=record, s=search) + command palette.
5. Statistics dashboard (total hours, lectures per subject).
6. Optional: real ASR hook via z-ai-web-dev-sdk ASR skill in the audio upload route.

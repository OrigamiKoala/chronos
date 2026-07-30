# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Chronos Bot** — an AI-powered olympiad test-prep sandbox (Math / Physics / Chemistry) that simulates exam stress conditions. React 19 + Vite frontend, Vercel serverless functions in `api/`, Gemini for question generation, BigQuery as the sole datastore. Deployed at https://chronos-bot.vercel.app.

## Commands

```bash
npm run dev        # Vite dev server (frontend only; /api routes are NOT served)
npm run build      # production build to dist/
npm run lint       # eslint
npx jest           # run all tests (no `test` script in package.json)
npx jest test/latex.test.js          # single file
npx jest -t "should normalize"       # single test by name
```

## Testing constraint (from `.agents/rules/testing.md`)

Do not try to verify changes by running a local server — there are no valid API keys in this environment, and `vite dev` does not serve the `api/` functions at all. Instead: either state what the user should verify and how, or commit and check the deployed frontend at https://chronos-bot.vercel.app.

`npm run lint` does **not** currently pass — it reports ~118 pre-existing problems, 88 of which are `no-useless-escape` inside the LaTeX/SMILES regexes where the escapes are deliberate. Treat it as a diff-level check (don't add new violations), not a green/red gate.

Jest runs in a `node` environment with babel-jest. Backend tests mock `@google-cloud/bigquery` at the module level (see `test/login.test.js`) — module-level schema-bootstrap flags mean you usually need `jest.resetModules()` between cases.

## Architecture

### Endpoint consolidation via `vercel.json` rewrites

`api/` holds 11 files but exposes many more logical endpoints. Related endpoints are folded into one function file and dispatched on `req.query.route`, with `vercel.json` rewriting the public path:

- `/api/submit-exam`, `/api/get-exam`, `/api/remark-correct`, `/api/save-tags`, `/api/save-explanation` → `api/exams.js`
- `/api/lessons`, `/api/student-homework` → `api/teacher-data.js`
- `/api/chat` → `api/explain.js`
- `/api/reset-password` → `api/login.js`

**Add new endpoints as a `route` branch in an existing file plus a rewrite**, not as a new file — the function count is deliberately kept low. Some handlers also infer the route from a body field when `route` is absent (e.g. `login.js` treats `body.step !== undefined` as reset-password), so keep both detection paths in sync.

### Gemini access — always through `api/_gemini.js`

Never construct a `GoogleGenAI` client directly. `executeWithRetry(models, fn)` handles everything:

- **Key rotation**: collects keys from `GEMINI_API_KEYS` (comma-separated), `GEMINI_API_KEY`, and numbered `api_1`…`api_100` env vars; picks a random start index and rotates on failure.
- **Error classification**: `429` marks that (model, key) pair rate-limited for the rest of the day in an in-memory registry; `503`/overload breaks out of the key loop immediately and falls through to the *next model* in the list (trying more keys against an overloaded model doesn't help).
- **Model cascade**: callers pass an ordered array, cheapest-viable-first. Convention across the codebase is `['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']` for analysis/explanation work; `api/generate.js` uses the stronger `['gemini-3.6-flash', 'gemini-3.5-flash', ...]` cascade for small batches and downgrades to lite-only when `count > 40`.

Calls use the **Interactions API** (`ai.interactions.create({ model, input, system_instruction, response_format })` → `.output_text`), not `generateContent`.

### The LaTeX sanitization pipeline

This is the most subtle part of the codebase and the source of most of the test suite. Gemini returns JSON containing LaTeX, and LaTeX backslashes collide with JSON escapes in every direction. `api/_gemini.js` handles it in layers, all funneled through `parseJSONResponse(text)`:

1. `escapeLiteralNewlines` — walks the raw string character by character deciding whether `\n`, `\t`, `\r`, `\b`, `\f` is a JSON escape or the start of a LaTeX command (`\nu`, `\text`, `\times`, `\beta`…). It carries an explicit allowlist of LaTeX commands starting with `n`.
2. `JSON.parse`, then `deepCleanLaTeX` → `normalizeLaTeX` on every string: repairs control characters that ate a command name (a literal tab followed by `imes` → `\times`), re-escapes bare chemical formulas (`ceH2A` → `\ce{H2A}`), and collapses over-escaped backslash runs.
3. `parseJSONResponse` falls back through ```` ```json ```` fences, bare fences, first `[...]` block, first `{...}` block, and finally unwraps a single-array-property object.

If you touch any of these, run `npx jest test/latex.test.js` — the cases there encode real model failure modes and are the regression net.

Rendering is MathJax 3 with the **mhchem** extension, loaded from CDN in `index.html` (config lives in the inline `window.MathJax` block). `src/components/ChemicalText.jsx` + `chemicalHelpers.js` additionally detect `<smiles>…</smiles>` spans and render them with smiles-drawer; `isSmiles()` carries heuristics to avoid mistaking English words and Roman numerals for SMILES.

### BigQuery data layer

Project `chronos-stress-sandbox`, dataset `chronos_users`. Credentials come from `BIGQUERY_PROJECT_ID` / `BIGQUERY_CLIENT_EMAIL` / `BIGQUERY_PRIVATE_KEY` (the private key's `\n` are unescaped at client construction). There is no ORM and no migration tool — every handler builds parameterized SQL strings with `bq.query({ query, params, types })`.

**Schema is self-bootstrapping.** Handlers run `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … ADD COLUMN IF NOT EXISTS` on cold start, guarded by a module-level `schemaEnsured` / `tablesEnsured` flag so it happens once per instance. `api/login.js` owns most `CREATE TABLE`s; `api/review.js` and `api/condense-topics.js` own the `ALTER`s for their own columns. **Adding a column means adding an `ADD COLUMN IF NOT EXISTS` to the appropriate bootstrap block**, not writing a migration.

Main tables: `users`, `user_exam_history`, `user_exam_results`, `user_topic_mastery`, `user_wrong_problems`, `user_weakness_analysis`, `user_mistake_analysis`, `user_problem_tags`, `user_active_exams`, `pregenerated_questions`, `lessons`, `homework_assignments`, `teacher_students`, `student_homework_questions`, `student_insights`.

Two recurring patterns worth matching:
- **Consolidated reads**: multiple independent lookups are merged into one query with `WITH` CTEs each emitting `(type, TO_JSON_STRING(STRUCT(...)) AS data)`, `UNION ALL`ed, then demultiplexed by `type` in JS. See `api/generate.js` and `api/analytics.js`. Do this rather than issuing several round trips.
- **Batched MERGE**: DML concurrency errors are a real problem on BigQuery, so per-row upserts are collapsed into a single `MERGE` whose source is a `UNION ALL` of parameterized `SELECT`s (`saveQuestionsToPregenerated`, the topic-mastery merge in `exams.js`). `exams.js` also wraps queries in a retry-with-backoff helper for concurrency errors.
- **Serverless write ordering**: the function is killed at `res.json()`, so any BigQuery write must be awaited before responding (`api/generate.js` collects `bqWritePromises` and `Promise.allSettled`s them for exactly this reason).

### Question generation and its fallback chain

`generateProblems()` in `src/components/ExamScreen.jsx` degrades three times before giving up:

1. `POST /api/generate` — pulls the user's weaknesses, prior analysis, topic breakdown, mistake patterns, and already-seen question IDs from BigQuery, builds a dynamic prompt, and loops up to 3 attempts until it has `count` questions. Generated questions are also merged into `pregenerated_questions` so they can be recycled. The client handles both a `text/event-stream` response and a plain JSON array; the handler currently returns JSON, so the SSE branch is dormant but intentionally retained.
2. `POST /api/fallback-questions` — draws from `pregenerated_questions`, excluding questions the user has already seen, ordered by closeness to the requested difficulty.
3. Locally generated mock questions, so the UI stays testable without any backend.

`api/generate.js` has its own inner fallback to `pregenerated_questions` inside its `catch` before returning 500.

### ELO rating

Ratings live per subject on `users` (`math_rating`, `physics_rating`, `chemistry_rating`), start at 100, and are floored at 100. Scoring (`api/exams.js`, submit-exam):

- Question difficulty 1–10 maps to an ELO via a fixed table (`1→100 … 5→1000 … 10→3000`).
- Standard expected-score formula against the average question rating.
- `K = 250` normally, dropping to `32` once the user is "challenged" — two consecutive exams below 75% accuracy — so ratings move fast early and stabilize under sustained difficulty.
- Multiplier `sqrt(totalQuestions / 5)` scales the swing by exam length.

`ELO_ALGORITHM_VERSION` (currently `4`, declared in both `api/exams.js` and `api/login.js`) is a recompute gate: login compares `users.elo_version` against it and replays the user's exam history to rebuild ratings when it's behind. **Bumping the constant triggers a full recalculation for every user on next login — keep the two declarations in sync.**

### Frontend structure

`src/App.jsx` is the single stateful root: it holds user/auth, ratings, strengths, weaknesses, history, and topic breakdowns, and switches screens via a `currentScreen` string rather than a router. Path → screen mapping happens in the initializer and on popstate (`/teacher`, `/admin`, `/test`, `/review`, `/check-in`, else setup).

Auth is a hand-rolled JWT: `base64url(payload).hmac-sha256` signed with `JWT_SECRET`, 90-day expiry, verified with `crypto.timingSafeEqual` (`api/login.js`). It's stored in the `chronos_logged_token` cookie alongside `chronos_user_data`.

**Guest mode** is pervasive: the sentinel username is `'default_user'`. Guests get analysis but no BigQuery persistence, and client state is namespaced into a separate set of localStorage keys (`chronos_guest_*` / `mock_exam_ratings` vs `chronos_cache_*` for logged-in users). When adding cached state, add both branches.

Roles are `student` / `teacher` / `admin` on `users.user_role`, scoped by `users.user_organization` (users join an org with a join code). `TeacherScreen` and `AdminScreen` gate on these.

The whiteboard (`src/components/Whiteboard.jsx`) uses Fabric.js loaded as a CDN global in `index.html`, not an npm import.

### Other endpoints

- `api/review.js` — spaced repetition over `user_wrong_problems` using SM-2 (`repetitions`, `interval_days`, `ease_factor` defaulting to 2.5, `next_review_at`).
- `api/condense-topics.js` — AI rollup of granular topics into parent topics, writing `parent_topic` / `good_at` / `not_good_at` onto `user_topic_mastery`. This backs the clickable strengths/weaknesses tags on the dashboard.
- `api/explain.js` — inline AI tutor for a completed question, plus (via `route=chat`) authenticated teacher chat.
- `api/analytics.js` — GET-only, accepts a comma-separated list of usernames so teachers can pull a cohort in one call.
- `api/teacher-data.js` — lessons, homework assignments, per-student insights and homework questions.

## Conventions

- ESM throughout (`"type": "module"`); the only CJS files are `babel.config.cjs` / `jest.config.cjs`.
- Usernames are normalized with `.trim().toLowerCase()` at every entry point before touching BigQuery — keep doing this.
- Subjects are lowercased server-side, and `ochem` / `organic chemistry` are folded into `chemistry`.
- Lint scopes differ by directory (browser globals for `src/`, node+jest for `api/` and `test/`); `dist` and `scratch` are ignored.
- `scratch/` holds unrelated side experiments (a Cloudflare worker, an Apps Script) — it is out of the lint and build path and generally shouldn't be touched when working on the app.

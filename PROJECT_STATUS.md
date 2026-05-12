# PROJECT_STATUS

Purpose
- Quick restart guide for the Legislation Tracker / Environmental Intelligence Platform.
- Human-readable summary of current system state + next steps.

Last Update
- 2026-05-11

GitHub
- https://github.com/ErickRuutt/Legislation-Tracker

Product Vision
- Multi-topic environmental chemical intelligence platform
- Neutral public tracking of legislation, corporate actors, and regulatory patterns
- Covers local / state / federal government levels simultaneously
- AI-assisted research queue → human-authored advocacy content
- Three layers: Intelligence (collect/score/track) → Amplification (content queue) → Public Website

Current State
- Phase 1 complete: multi-topic architecture refactored from single-topic PFAS Monitor
- TypeScript compiles clean (0 errors)
- Deployment config ready: Railway (backend) + Vercel (dashboard)
- Awaiting Railway project setup + persistent volume + env vars

How To Run (local)
- Backend: `cd ~/pfas-monitor && npm run dev`
- Dashboard: `cd ~/pfas-monitor/dashboard && npm run dev`

Schema — New Tables (Phase 1)
- `topics` — tracked topics with keywords_json + category_weights_json
- `topic_items` — junction table linking any item to any topic (article/legislation/contract/social_post)
- `government_level` + `jurisdiction` — added to legislation (backfilled from source)
- `corporate_actors` — stub, not wired yet
- `actor_mentions` — stub, not wired yet
- `content_queue` — stub, not wired yet
- `published_content` — stub, not wired yet

Seeded Topics
1. PFAS (slug: pfas) — per- and polyfluoroalkyl substances
2. Roundup / Glyphosate (slug: roundup) — herbicide regulation + health research
3. Environmental Chemicals (slug: environmental-chemicals) — broad industrial/synthetic chemical tracking

Key Files
- `src/analysis/topic-matcher.ts` — DB-aware topic scoring, 5-min cache, invalidated on topic change
- `src/collectors/base-collector.ts` — insertTopicItems() runs after every new insert
- `src/api/routes/topics.ts` — CRUD for topics, invalidates cache on write
- `src/api/middleware/auth.ts` — protectWrites: GET routes public, POST/PUT/PATCH/DELETE require X-API-Key

API Filters Added
- All content routes accept `?topicId=` (joins topic_items)
- Legislation route accepts `?governmentLevel=` and `?jurisdiction=`

Deployment Architecture
- Backend: Railway — persistent Node.js server, SQLite on persistent volume at /app/data
- Dashboard: Vercel — Next.js, BACKEND_URL env var points to Railway URL
- Auth: API_KEY env var gates all write routes (open in dev when unset)

Railway Setup Steps (pending)
1. New project → deploy from ErickRuutt/Legislation-Tracker
2. Add volume: mount path /app/data
3. Set env vars (see .env.example) — generate API_KEY with: openssl rand -hex 32
4. Copy Railway domain URL

Vercel Setup Steps (pending)
1. New project → ErickRuutt/Legislation-Tracker → Root Directory: dashboard
2. Add BACKEND_URL = Railway domain URL
3. Deploy

Useful Endpoints
- GET  /api/topics                          — list all topics with item counts
- POST /api/topics                          — create topic (requires API key)
- GET  /api/articles?topicId=1              — articles for a topic
- GET  /api/legislation?topicId=1&governmentLevel=federal
- GET  /api/legislation?topicId=1&jurisdiction=WA
- POST /api/collectors/run/google_news      — trigger collector (requires API key)
- GET  /api/health                          — health check

Phase Roadmap
- Phase 1 (DONE): Topic model, multi-topic tracking, government levels, deployment config
- Phase 2: Broader legislative coverage — county/city sources, EPA rulemaking feeds
- Phase 3: Corporate actor extraction — NER on articles/bills, actor_mentions wired up, pattern detection cron
- Phase 4: Public website — regional map, legislative tracker, corporate watch, signal feed (separate Next.js app)
- Phase 5: Content queue — trigger on patterns, AI research brief generation, human approval UI

Known Gaps / Next Priorities
1. Complete Railway + Vercel deployment
2. Wire corporate_actors NER extraction (Phase 3)
3. Build public website (Phase 4) — this is what gets hosted publicly
4. Add Roundup-specific collector queries (NewsAPI QUERIES + KNOWN_BILLS still PFAS-only)
5. Content queue UI (Phase 5)

Reference
- Architecture + ITC design: discussed in conversation history
- Codex log: codex-spec-design.md

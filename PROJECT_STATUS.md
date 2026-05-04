# PROJECT_STATUS

Purpose
- Quick restart guide for the PFAS Monitor project.
- Human-readable summary of current system state + next steps.

Last Update
- 2026-02-17

Current State
- Backend runs with `npm run dev`.
- NewsAPI key configured; NewsAPI + RSS ingestion confirmed.
- RSS feeds are authoritative sources + Google News keyword feeds.
- Daily/weekly/monthly digest pipeline exists.
- Favorites + notes + tags in News UI implemented.
- Legislation mention extraction + coverage gap endpoint implemented.
- PDF ingestion uses true per-page extraction, smaller chunks, LLM reranker.

How To Run
- Backend: `cd ~/pfas-monitor && npm run dev`
- Dashboard: `cd ~/pfas-monitor/dashboard && npm run dev`

Useful Endpoints
- Run RSS: POST `http://localhost:3001/api/collectors/run/google_news`
- Run NewsAPI: POST `http://localhost:3001/api/collectors/run/newsapi`
- Enrich articles: POST `http://localhost:3001/api/articles/enrich/fulltext` {"limit":30}
- Digest daily: POST `http://localhost:3001/api/collectors/digest/daily`
- Coverage gaps: GET `http://localhost:3001/api/legislation/coverage/gaps?days=30&limit=25`

Known Gaps
- Keywords need tuning for legislative/regulatory coverage.
- Re-ingest PDFs after true page extraction + smaller chunking.
- UI debug mode for retrieval transparency not built yet.
- Full-text article chunking + embeddings not built yet.

Next Priorities
1. Re-ingest PDFs and re-run structured QA tests.
2. Improve keyword lists (legislation + regulatory focus).
3. Add article full-text chunking + embeddings for unified corpus.
4. Add UI debug view for retrieved chunks and scores.

Reference
- Detailed log: `codex-spec-design.md`

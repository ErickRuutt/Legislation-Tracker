# CODEX_SPEC_DESIGN_LOG
# Purpose: LLM-readable memory of decisions, changes, tests, and reasoning.
# Format: key: value blocks with explicit separators for retrieval.

META
id: codex_spec_design_log
project: legislation-tracker
owner: codex
last_updated: 2026-05-11

=== ENTRY ===
entry_id: 2026-05-11-001
entry_type: architectural_pivot
summary: Refactored single-topic PFAS Monitor into multi-topic environmental intelligence platform
changes:
- Added topics table with keywords_json + category_weights_json (replaces hardcoded PFAS_KEYWORDS)
- Added topic_items junction table linking articles/legislation/contracts/social_posts to topics
- Added government_level + jurisdiction columns to legislation (backfilled: congress=federal/US, wa_legislature=state/WA, or_legislature=state/OR)
- Added corporate_actors + actor_mentions tables (stubs, not wired)
- Added content_queue + published_content tables (stubs, not wired)
- Created src/analysis/topic-matcher.ts: DB-aware, cached, returns per-topic scores for any text
- Updated BaseCollector.insertTopicItems(): runs after every new item insert across all 5 collectors
- Created /api/topics CRUD route with cache invalidation
- Added topicId filter to articles, legislation, contracts, social routes
- Added governmentLevel + jurisdiction filters to legislation route
- Seeded 3 topics: PFAS, Roundup/Glyphosate, Environmental Chemicals
- Backfill migration: existing items assigned to PFAS topic (id=1)
why:
- User wants to track multiple environmental chemical topics (PFAS, Roundup, others)
- User wants a public-facing website showing trends across local/state/federal government
- User wants corporate actor pattern detection (same corp in multiple jurisdictions)
- User wants human-approved content queue for advocacy publishing
decisions:
- Topics as data model, not config: keyword sets live in DB, editable via API, cached in memory
- Junction table over topic_id columns: one item can belong to multiple topics
- government_level derived from source on backfill, set explicitly on new inserts going forward
- corporate_actors/content_queue added as stubs now to avoid future migration pain
risks:
- topic_items backfill assigns all existing data to PFAS only — Roundup/Env Chem items will only appear after recollection
- NewsAPI QUERIES and KNOWN_BILLS in collectors still PFAS-focused — need to add Roundup queries in Phase 2

=== ENTRY ===
entry_id: 2026-05-11-002
entry_type: bugfix
summary: Fixed 3 pre-existing TypeScript errors (codebase now compiles clean)
changes:
- digests.ts L72+L79: rows → rowsWithContent (variable name typo)
- api/routes/research.ts L79: Request → Request<{jobId:string}> (untyped params)
- research/generate.ts: rerankChunksWithLLM made generic <T extends {...}> so return type matches SearchResult[]
why:
- tsc --noEmit was failing on 4 errors, all pre-existing before this session

=== ENTRY ===
entry_id: 2026-05-11-003
entry_type: deployment
summary: Prepared for Railway (backend) + Vercel (dashboard) deployment
changes:
- Added railway.toml: buildCommand = npm ci && npm run build, startCommand = npm start
- Added src/api/middleware/auth.ts: protectWrites middleware — GET routes public, POST/PUT/PATCH/DELETE require X-API-Key header
- Applied protectWrites globally in server.ts before all routes
- Updated dashboard/next.config.ts: BACKEND_URL env var replaces hardcoded localhost:3001
- Updated .gitignore: added data/*.db-wal + data/*.db-shm + data/research_pdfs/
- Created .env.example documenting all required env vars
- Initialized git repo, pushed to https://github.com/ErickRuutt/Legislation-Tracker
why:
- User wants hosted deployment; Railway chosen for persistent server (required for cron jobs + worker processes)
- SQLite kept over Postgres migration to ship faster; can migrate later
- API_KEY auth gates write routes before going public
decisions:
- Stay on SQLite: ship today vs 1-2 days migration; can revisit when scale demands it
- protectWrites at server level (not per-route) so all future routes inherit auth automatically
- API_KEY unset in local dev = all routes open (convenience)
next:
- User completes Railway setup: new project, persistent volume at /app/data, env vars
- User completes Vercel setup: root dir = dashboard, BACKEND_URL = Railway URL

=== ENTRY ===
entry_id: 2026-02-12-001
entry_type: change
summary: Async ingestion + worker + retries + error boundaries + UI refresh
changes:
- Added async ingestion with job tracking and worker process
- Added retry + timeout policy for ingestion workers
- Added error boundaries and clearer startup errors
- Updated dashboard UI (Every-inspired aesthetic, research flow, status polling)
why:
- Separate heavy PDF parsing from API process to prevent crashes
- Make long processing visible and reliable for single-user workflow
- Keep reliability without adding infrastructure
- UI should reinforce trust via status + citations
risks:
- Local-only worker stops if API stops
- Timeouts may terminate very large PDFs
- UI assumes citations/status always available
next:
- Retrieval quality audit (chunking, citations, ranking)
- Export endpoints + memo format
- Add notes/tags if needed

=== ENTRY ===
entry_id: 2026-02-12-002
entry_type: test
summary: Retrieved real query outputs from running API
changes:
- Collected user-provided curl outputs for real queries
why:
- Validate retrieval quality before code changes
risks:
- Corpus lacked WA mandate sources; answers empty
- One document had 0 chunks/embeddings (failed ingest)
next:
- Re-ingest zero-chunk documents
- Add WA mandate sources
- Improve retrieval + citation logic

=== ENTRY ===
entry_id: 2026-02-12-003
entry_type: change
summary: Added helper script for page-level extraction + keyword hits
changes:
- Added helper script to extract page-level text + keyword hits
- Generated exports for three test PDFs
why:
- Need verifiable “truths” with page numbers to evaluate retrieval
- Keyword scanning speeds page selection
risks:
- Page splitting approximate; citations still need manual verification
- Keyword hits can miss rephrased facts
next:
- Select 3–5 truths per document
- Ingest PDFs, run structured questions
- Score accuracy + citation quality

=== ENTRY ===
entry_id: 2026-02-12-004
entry_type: decision
summary: Spatial chunk IDs proposal graded B+
changes:
- Adopted deterministic chunk IDs: docId + pageNumber + chunkIndex
- Updated chunk splitting to prefer sentence boundaries
why:
- Stable, spatial IDs make citations traceable and debuggable
- Sentence-aware splits reduce meaning loss
risks:
- Deterministic IDs change if chunking changes
- Heuristic sentence splitting can still cut long sentences
next:
- Consider stricter sentence splitter
- Add citation overlap checks and date-aware retrieval

=== ENTRY ===
entry_id: 2026-02-12-005
entry_type: change
summary: Date-aware retrieval + citation filtering for date queries
changes:
- Retrieval now prefers chunks containing date tokens in query
- Citations filtered to require date token presence
why:
- Date queries are precision-sensitive
- Prevents plausible-but-wrong citations
risks:
- Strict filtering can yield “insufficient evidence” when dates are formatted differently
- Month/day parsing is heuristic
next:
- Add numeric date parsing (e.g., 1/1/2025)
- Evaluate chunk size after re-ingest

=== ENTRY ===
entry_id: 2026-02-12-006
entry_type: test
summary: Retrieval audit on three PDFs with structured questions
notes:
- Idea: spatial chunk IDs (docId+page+block) graded B+; must avoid fixed-length splits
- WA Ecology Jan 1, 2025 query cited p.26 instead of p.74 (likely incorrect)
- AFFF EIS alternatives query looked correct with p.3
- EFR HQ IVES cleanup+schedule query partially correct; timeline ok, cleanup levels missed
scores:
- WA Ecology: correctness 2/5, citation_accuracy 1/5
- AFFF EIS: correctness 4/5, citation_accuracy 4/5
- EFR HQ IVES: correctness 3/5, citation_accuracy 3/5, coverage 2/5
risks:
- Date mismatch and over-answering identified as top failure modes
next:
- Re-ingest PDFs with new chunk IDs/splitting
- Re-run structured queries and re-score
- Improve date parsing + citation alignment

=== ENTRY ===
entry_id: 2026-02-12-007
entry_type: change
summary: Increased upload/worker timeouts + logging for large PDFs
changes:
- Increased multer upload size limit to 300MB
- Increased worker timeout to 30 minutes
- Disabled server socket timeout for long uploads
- Added upload size logging and worker exit logging
why:
- Large PDFs can take longer than default timeouts; prevent silent failures
- Logging improves visibility when timeouts happen
risks:
- Very long-running workers can tie up resources
- Larger uploads increase disk usage
next:
- If large PDFs still fail, implement page-range splitting + queued sub-jobs

=== ENTRY ===
entry_id: 2026-02-12-008
entry_type: change
summary: Added explicit upload middleware error handling + global error handler
changes:
- Wrapped multer upload to capture middleware errors and return 400 with logs
- Added global Express error handler for visibility
why:
- 500s were occurring without logs; need clear root-cause signal
risks:
- Error handler returns generic 500 unless specific errors are surfaced
next:
- Re-test upload via UI; capture new error message if it persists

=== ENTRY ===
entry_id: 2026-02-12-009
entry_type: change
summary: Increased Next.js proxy body limit to prevent 10MB upload cap
changes:
- Set dashboard/next.config.ts experimental.middlewareClientMaxBodySize to 300mb
why:
- UI proxy was truncating uploads at 10MB and resetting the socket (ECONNRESET)
risks:
- Larger uploads increase memory/processing on the dev server
next:
- Restart dashboard dev server and retry large uploads

=== ENTRY ===
entry_id: 2026-02-12-010
entry_type: change
summary: Added count-precision and multi-part query expansion
changes:
- Split queries on conjunctions to retrieve chunks per sub-question
- Added count-token guard for “how many/number of” questions
- Return safe refusal if count token not present in cited chunks
why:
- Prevent incorrect numeric answers (e.g., 3 vs 4 alternatives)
- Multi-part queries often need different chunks (cleanup levels + schedule)
risks:
- More retrieval calls increase latency/cost
- Count-token guard may be too strict when numbers are implied
next:
- Re-run structured tests and re-score
- Consider numeric date parsing (1/1/2025) if date queries still fail

=== ENTRY ===
entry_id: 2026-02-12-012
entry_type: vision
summary: North star vision for toxin intelligence + community-scale education
vision:
- Build a trusted toxin intelligence engine (starting with PFAS) that aggregates evidence-grade data.
- Use education + data to shift toxic exposure from individual concern to community-level action.
- Translate trust into comprehensive testing services for land + housing investments.
- Scale from PFAS to broader toxins (e.g., legacy pesticides) and expand into product testing + knowledge leadership.
notes:
- AI enables aggregation of heterogeneous data + hypothesis testing.
- Trust and citation rigor are non-negotiable; the system is a proof engine, not a summary engine.

=== ENTRY ===
entry_id: 2026-02-12-013
entry_type: change
summary: Updated RSS feed list to authoritative national sources + 8-hour cadence
changes:
- Replaced Google News keyword feeds with official EPA/USGS/OSHA/CDC/GovInfo RSS sources
- Set RSS collector schedule to every 8 hours
why:
- Prioritize authoritative regulatory/scientific sources for signal quality
- Match desired cadence for daily briefing pipeline
risks:
- Some feeds may be unavailable or change URLs; collector will log failures
next:
- Run collector manually to validate feed parsing
- Add manual refresh in UI if needed (API already supports /collectors/run/google_news)

=== ENTRY ===
entry_id: 2026-02-12-014
entry_type: change
summary: Built RSS expansion + digest pipeline + manual refresh UI
changes:
- Added authoritative national RSS feeds plus Google News keyword feeds
- Set RSS collector cadence to every 8 hours
- Added daily/weekly/monthly news digest generator and scheduler
- Added API endpoints to run/fetch digests
- Added News UI button to refresh RSS
why:
- Provide signal quality for daily/weekly newsletters and trend analysis
- Enable manual refresh without waiting for cron
risks:
- Digest uses summaries from article metadata (full text not yet integrated)
- More feeds increase request volume; some may fail intermittently
next:
- Validate collector run and digest output quality
- Add full-text extraction pipeline for richer digests
- Wire Sender integration when spec is ready

=== ENTRY ===
entry_id: 2026-02-12-015
entry_type: change
summary: Added favorites + article drawer with notes and tags
changes:
- Added article fields: summary_text, tags_json, is_favorite
- Added article_notes table
- Added article APIs: detail, favorite toggle, tag update, note creation
- Added News UI: favorites toggle and right-side drawer with summary, tags, notes
why:
- Enable manual curation and annotation of news signals for later filtering and analysis
risks:
- Tags and notes are manual; no autocomplete yet
- Drawer uses summary/description; full-text summaries not integrated yet
next:
- Run migrations and restart backend
- Optionally add favorites filter in UI
- Add summary generation when full-text pipeline is ready

=== ENTRY ===
entry_id: 2026-02-12-016
entry_type: fix
summary: Added articles.updated_at column for favorite/tag updates
changes:
- Added updated_at column to articles table
- Added migration to backfill updated_at column
why:
- PATCH endpoints update updated_at; column was missing in existing DB
risks:
- None; migration adds column with default
next:
- Restart backend to run migration

=== ENTRY ===
entry_id: 2026-02-12-017
entry_type: change
summary: Added Favorites-only filter toggle in News UI
changes:
- Added favoriteOnly state and query param
- Added checkbox toggle in News filters
why:
- Enables quick focus on curated/favorited articles
risks:
- None
next:
- Move to legislature feed updates

=== ENTRY ===
entry_id: 2026-02-12-018
entry_type: change
summary: Added legislation mention extraction + coverage metrics
changes:
- Added article_legislation_mentions table + indexes
- Implemented bill mention extraction (federal + state) with state detection
- Linked mentions to known legislation when possible; store placeholder otherwise
- Added mention_count to legislation list + mention details on legislation detail endpoint
- Hooked mention extraction into RSS and NewsAPI collectors
why:
- Auto-link legislation mentions from news to track coverage vs activity
- Surface “why is this not being covered?” gaps
risks:
- Regex-based bill detection can miss formats or create false positives
- State detection depends on state names appearing in text
next:
- Add backfill job to process existing articles
- Expand bill patterns and state detection rules
- Add UI view for coverage gap metrics

=== ENTRY ===
entry_id: 2026-02-12-019
entry_type: change
summary: Added legislation mention backfill + coverage gap reporting + expanded bill detection
changes:
- Expanded bill regex patterns (SB/HB, S.B./H.B., Senate Bill/House Bill)
- Added state code detection (excluding OR to avoid false positives)
- Added backfill API to scan existing articles for bill mentions
- Added coverage gap endpoint to compare legislative actions vs media mentions
why:
- Enable retroactive linkage of articles to bills
- Surface under-covered legislation and trend gaps
risks:
- Regex approach may still miss some formats
- Coverage gap uses action_date/created_at; depends on data quality
next:
- Run backfill job after restart
- Evaluate coverage gap results and adjust thresholds

=== ENTRY ===
entry_id: 2026-02-12-020
entry_type: fix
summary: Fixed SQLite migration error for updated_at default
changes:
- Added helper to add columns without non-constant defaults
- Added articles.updated_at as nullable then backfilled to datetime('now')
why:
- SQLite disallows non-constant defaults in ALTER TABLE
risks:
- New rows rely on application to set updated_at unless schema default exists (table definition still has default)
next:
- Restart backend to run migrations

=== ENTRY ===
entry_id: 2026-02-12-021
entry_type: change
summary: Improved legislation mention jurisdiction inference
changes:
- Added patterns for state-coded bill mentions (e.g., "VA SB 123", "SB 123 (WA)")
- Infer jurisdiction from local context window around bill mention
- Normalize bill numbers to consistent format
why:
- Increase recall for state bill mentions and reduce unknown jurisdiction
risks:
- Context window may still miss state if not nearby
next:
- Re-run backfill after restart
- Consider adding a state-specific RSS list once URLs are confirmed

=== ENTRY ===
entry_id: 2026-02-12-022
entry_type: change
summary: True per-page PDF extraction + single-process ingestion
changes:
- Replaced synthetic splitIntoPages with pdf-parse pagerender per-page extraction
- Removed pdf-worker child process; ingest runs in worker process with higher heap
- Added --max-old-space-size=8192 to ingest worker
why:
- Page numbers must reflect actual PDF pages for citation integrity
- Simplify error paths by removing nested child process
risks:
- pdf-parse pagerender may still produce uneven text for some PDFs
next:
- Re-ingest test PDFs and re-run structured citation tests

=== ENTRY ===
entry_id: 2026-02-12-023
entry_type: change
summary: Retrieval quality upgrades + full-text enrichment + tighter chunking
changes:
- Added shared query token helpers (dates + numeric formats, count tokens)
- Added in-memory embedding cache with invalidation by count
- Added LLM re-ranker to filter top chunks by relevance
- Added full-text enrichment for articles using article-extractor
- Digests now prefer full text/summary_text (not just RSS snippets)
- Reduced chunk size to 1500 chars with overlap 150 for higher precision
why:
- Improve precision and trust of answers; reduce over-answering
- Enable higher-quality daily/weekly digests
- Prepare for larger corpus without O(n) JSON parse on every query
risks:
- LLM re-rank adds latency/cost
- Full-text extraction may fail on some sites
- Smaller chunks increase embedding volume
next:
- Re-ingest PDFs to apply new chunk size + true page boundaries
- Install new dependency and run npm install

=== ENTRY ===
entry_id: 2026-02-12-024
entry_type: summary
summary: End-of-day recap
changes:
- Implemented true per-page PDF extraction via pdf-parse pagerender; removed synthetic page splitting
- Removed nested pdf-worker; ingestion now parses in ingest-worker with 8GB heap
- Added embedding cache + LLM re-ranker for higher precision QA
- Added shared query token helpers (dates + numeric formats) and count tokens
- Added full-text enrichment for news articles using article-extractor
- Digests now prefer full text/summary_text over RSS snippets
- Reduced chunk size to 1500 chars for better retrieval granularity
notes:
- Requires npm install to pick up @extractus/article-extractor
- Requires re-ingest of PDFs to apply true page boundaries + new chunk size
next:
- Re-ingest test PDFs and re-run structured QA tests
- Validate digest quality with full-text enrichment
- Consider UI debug mode for retrieved chunks + scores

=== ENTRY ===
entry_id: 2026-02-12-025
entry_type: fix
summary: Fixed unterminated string in LLM re-ranker prompt assembly
changes:
- Corrected newline join in userPrompt construction for reranker
why:
- esbuild failed to parse malformed string literal
next:
- Restart backend

=== ENTRY ===
entry_id: 2026-02-17-001
entry_type: status
summary: Project checkpoint — backend running, NewsAPI/RSS ingestion confirmed
status:
- Backend booted successfully after dependency install
- NewsAPI key configured in .env and collector runs
- RSS + NewsAPI items visible in articles table; ingestion confirmed
- Digest pipeline + enrichment endpoints available
notes:
- Many items currently have relevance_score 0; keyword tuning and full-text enrichment will improve scoring
- Full-text enrichment requires @extractus/article-extractor (installed)
ready_to_run:
- POST /api/collectors/run/newsapi
- POST /api/collectors/run/google_news
- POST /api/articles/enrich/fulltext {limit}
- POST /api/collectors/digest/daily
next:
- Re-ingest PDFs with true page extraction + smaller chunks
- Re-run structured QA tests
- Expand keyword lists for legislative/regulatory coverage

=== ENTRY ===
entry_id: 2026-02-17-002
entry_type: change
summary: Added PROJECT_STATUS updater script
changes:
- Added scripts/update-project-status.ts to regenerate PROJECT_STATUS.md
- Added npm script status:update
why:
- Make status documentation consistent and easy to refresh
next:
- Run `npm run status:update` at key milestones

=== ENTRY ===
entry_id: 2026-02-09-001
entry_type: planning
summary: Daily Dispatch Pipeline — phased architecture for automated intelligence cycle
reference: https://techysurgeon.substack.com/p/the-6-am-dispatch-how-i-use-claude
pattern: Parallel independent workers → enrichment → synthesis (inspired by "6 AM Dispatch" multi-agent pattern)
phases:
  phase_1_collectors:
    status: built
    description: All 5 collectors run independently on cron schedules
    workers:
    - GoogleNewsCollector (15 RSS feeds, 8hr)
    - NewsApiCollector (5 queries, 6hr)
    - CongressCollector (118th/119th + known bills, 6hr)
    - SamGovCollector (7 keywords, 4hr)
    - RedditCollector (11 subreddits, 3hr)
  phase_2_enrichment:
    status: partially_built
    description: Process new items after collection
    workers:
    - Article full-text extractor — endpoint exists (POST /api/articles/enrich/fulltext), needs automation
    - Article chunker/embedder — NOT BUILT. Need article_chunks + article_embeddings tables, same pipeline as research PDFs
    - Legislation mention linker — built but manual trigger only, needs auto-run on new articles
  phase_3_synthesis:
    status: partially_built
    description: Generate intelligence products from enriched data
    workers:
    - Daily digest — built, now uses full text when available
    - Trend analysis (keyword frequency over time, emerging topics) — NOT BUILT
    - Coverage gap report — built as endpoint, not automated
    - Unified corpus search — NOT BUILT. /ask should search both research_embeddings and article_embeddings
orchestration:
  description: Single entry point script (e.g., scripts/daily-dispatch.ts) that
  steps:
  - 1. Spawn Phase 1 collectors in parallel (reuse spawnIngestWorker pattern)
  - 2. Wait for all to complete
  - 3. Spawn Phase 2 enrichment on new items
  - 4. Wait for completion
  - 5. Run Phase 3 synthesis (digest, trends, gaps)
  cron: "0 6 * * *" (daily at 6 AM)
design_decisions:
- Article chunks stored in separate tables (article_chunks/article_embeddings), not in research_* tables
- Union search at query time across both embedding pools
- Same chunking/embedding pipeline shared between articles and PDFs
- Full-text extraction uses @extractus/article-extractor (already installed)
next:
- Build article_chunks + article_embeddings schema
- Build article chunking/embedding worker
- Extend search.ts to query both embedding pools
- Build orchestrator script (daily-dispatch.ts)
- Build trend analysis (keyword clustering over time)
- Wire cron trigger

=== ENTRY ===
entry_id: 2026-02-09-002
entry_type: audit
summary: Full codebase review — recommendations after reading all implementation files
reviewed_by: claude
findings:
  already_fixed_by_codex:
  - True per-page PDF extraction (entry 022)
  - Removed nested child process (entry 022)
  - Embedding cache (entry 023)
  - LLM re-ranker (entry 023)
  - Full-text enrichment (entry 023)
  - Shared query token helpers (entry 023)
  - Chunk size reduction to 1500 (entry 023)
  remaining_high_priority:
  - Re-ingest all existing PDFs with true page extraction + new chunk size
  - Build article chunk/embed pipeline for unified corpus search
  - Automate the enrichment step (currently manual endpoint)
  remaining_moderate:
  - Multi-part query splitting on "and" is fragile
  - No debug/observability mode in UI for retrieval pipeline
  - Consider text-embedding-3-large for better retrieval quality
  remaining_low:
  - Keyword tuning for article relevance scoring
  - No weekly_digest generation function (schema supports it, no implementation)

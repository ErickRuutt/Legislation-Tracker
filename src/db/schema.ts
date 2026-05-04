export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS legislation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL CHECK(source IN ('congress', 'wa_legislature', 'or_legislature')),
  external_id TEXT NOT NULL,
  bill_number TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'introduced',
  chamber TEXT,
  sponsor TEXT,
  introduced_date TEXT,
  last_action_date TEXT,
  url TEXT,
  relevance_score REAL NOT NULL DEFAULT 0,
  keywords_matched TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source, external_id)
);

CREATE TABLE IF NOT EXISTS legislation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  legislation_id INTEGER NOT NULL REFERENCES legislation(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  description TEXT,
  action_date TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notice_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  agency TEXT,
  office TEXT,
  naics_code TEXT,
  set_aside TEXT,
  response_deadline TEXT,
  posted_date TEXT,
  url TEXT,
  relevance_score REAL NOT NULL DEFAULT 0,
  keywords_matched TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  summary_text TEXT,
  author TEXT,
  url TEXT NOT NULL,
  image_url TEXT,
  published_at TEXT,
  region TEXT,
  relevance_score REAL NOT NULL DEFAULT 0,
  keywords_matched TEXT,
  tags_json TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source, external_id)
);

CREATE TABLE IF NOT EXISTS article_notes (
  id TEXT PRIMARY KEY,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS article_legislation_mentions (
  id TEXT PRIMARY KEY,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  legislation_id INTEGER REFERENCES legislation(id) ON DELETE SET NULL,
  bill_number TEXT NOT NULL,
  jurisdiction TEXT,
  mention_text TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(article_id, bill_number, jurisdiction)
);

CREATE INDEX IF NOT EXISTS idx_article_mentions_legislation ON article_legislation_mentions(legislation_id);
CREATE INDEX IF NOT EXISTS idx_article_mentions_bill ON article_legislation_mentions(bill_number);

CREATE TABLE IF NOT EXISTS social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL DEFAULT 'reddit',
  external_id TEXT NOT NULL,
  subreddit TEXT,
  author TEXT,
  title TEXT,
  body TEXT,
  url TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  num_comments INTEGER NOT NULL DEFAULT 0,
  sentiment REAL,
  relevance_score REAL NOT NULL DEFAULT 0,
  keywords_matched TEXT,
  posted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(platform, external_id)
);

CREATE TABLE IF NOT EXISTS social_daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  subreddit TEXT,
  date TEXT NOT NULL,
  post_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  avg_score REAL NOT NULL DEFAULT 0,
  avg_sentiment REAL,
  top_keywords TEXT,
  UNIQUE(platform, subreddit, date)
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  conditions TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER REFERENCES alert_rules(id),
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK(severity IN ('critical', 'high', 'medium', 'low')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT,
  acknowledged INTEGER NOT NULL DEFAULT 0,
  acknowledged_at TEXT,
  email_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS collector_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collector TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'success', 'error')),
  items_found INTEGER NOT NULL DEFAULT 0,
  items_new INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_legislation_source ON legislation(source);
CREATE INDEX IF NOT EXISTS idx_legislation_status ON legislation(status);
CREATE INDEX IF NOT EXISTS idx_legislation_relevance ON legislation(relevance_score DESC);

CREATE INDEX IF NOT EXISTS idx_contracts_deadline ON contracts(response_deadline);
CREATE INDEX IF NOT EXISTS idx_contracts_naics ON contracts(naics_code);

CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
CREATE INDEX IF NOT EXISTS idx_articles_relevance ON articles(relevance_score DESC);

CREATE INDEX IF NOT EXISTS idx_social_posts_subreddit ON social_posts(subreddit);
CREATE INDEX IF NOT EXISTS idx_social_posts_posted ON social_posts(posted_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collector_runs_collector ON collector_runs(collector);

-- =============================================
-- Research Document Repository (Track 3)
-- =============================================

CREATE TABLE IF NOT EXISTS research_documents (
  id TEXT PRIMARY KEY,
  source_url TEXT,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'pdf_upload' CHECK(source_type IN ('pdf_upload', 'pdf_url', 'future')),
  local_path TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE,
  page_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS research_pages (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES research_documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  page_text TEXT NOT NULL,
  char_start INTEGER,
  char_end INTEGER,
  UNIQUE(document_id, page_number)
);

CREATE TABLE IF NOT EXISTS research_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES research_documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  chunk_text TEXT NOT NULL,
  char_start_in_page INTEGER NOT NULL,
  char_end_in_page INTEGER NOT NULL,
  token_estimate INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(document_id, page_number, chunk_index)
);

CREATE TABLE IF NOT EXISTS research_embeddings (
  chunk_id TEXT PRIMARY KEY REFERENCES research_chunks(id) ON DELETE CASCADE,
  embedding_model TEXT NOT NULL,
  dims INTEGER NOT NULL,
  vector_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS research_outputs (
  id TEXT PRIMARY KEY,
  output_type TEXT NOT NULL CHECK(output_type IN ('doc_summary', 'qa_answer', 'weekly_digest')),
  prompt TEXT NOT NULL,
  response_markdown TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  metadata_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS research_ingest_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'success', 'error')),
  document_id TEXT,
  file_path TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS research_output_citations (
  id TEXT PRIMARY KEY,
  output_id TEXT NOT NULL REFERENCES research_outputs(id) ON DELETE CASCADE,
  citation_type TEXT NOT NULL CHECK(citation_type IN ('internal', 'web')),
  document_id TEXT,
  chunk_id TEXT,
  page_number INTEGER,
  source_url TEXT,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_research_pages_doc ON research_pages(document_id);
CREATE INDEX IF NOT EXISTS idx_research_chunks_doc ON research_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_research_embeddings_model ON research_embeddings(embedding_model);
CREATE INDEX IF NOT EXISTS idx_research_outputs_type ON research_outputs(output_type);
CREATE INDEX IF NOT EXISTS idx_research_citations_output ON research_output_citations(output_id);

-- =============================================
-- Multi-Topic Intelligence Platform
-- =============================================

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  category_weights_json TEXT NOT NULL DEFAULT '{}',
  related_topic_ids_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS topic_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK(item_type IN ('article', 'legislation', 'contract', 'social_post')),
  item_id INTEGER NOT NULL,
  relevance_score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(topic_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_topic_items_topic ON topic_items(topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_items_type_id ON topic_items(item_type, item_id);

-- =============================================
-- Corporate Actor Tracking
-- =============================================

CREATE TABLE IF NOT EXISTS corporate_actors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  industry TEXT,
  hq_state TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS actor_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER NOT NULL REFERENCES corporate_actors(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK(item_type IN ('article', 'legislation', 'contract', 'social_post')),
  item_id INTEGER NOT NULL,
  mention_type TEXT NOT NULL DEFAULT 'named',
  mention_text TEXT,
  extracted_by TEXT NOT NULL DEFAULT 'manual' CHECK(extracted_by IN ('llm', 'manual')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_actor_mentions_actor ON actor_mentions(actor_id);
CREATE INDEX IF NOT EXISTS idx_actor_mentions_type_id ON actor_mentions(item_type, item_id);

-- =============================================
-- Content Queue (human-in-the-loop publishing)
-- =============================================

CREATE TABLE IF NOT EXISTS content_queue (
  id TEXT PRIMARY KEY,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK(trigger_type IN ('new_bill', 'corporate_pattern', 'signal_spike', 'manual')),
  signal_ids_json TEXT NOT NULL DEFAULT '[]',
  research_brief_md TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'in_research', 'ready_for_draft', 'published', 'dismissed')),
  assigned_to TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS published_content (
  id TEXT PRIMARY KEY,
  queue_item_id TEXT REFERENCES content_queue(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  body_md TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_content_queue_status ON content_queue(status);
CREATE INDEX IF NOT EXISTS idx_content_queue_topic ON content_queue(topic_id);
CREATE INDEX IF NOT EXISTS idx_published_content_slug ON published_content(slug);
`;

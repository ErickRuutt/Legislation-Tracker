import { getDb, closeDb } from './connection';
import { SCHEMA_SQL } from './schema';
import { logger } from '../shared/logger';

export function runMigrations(): void {
  const db = getDb();
  logger.info('Running database migrations...');

  db.exec(SCHEMA_SQL);

  const addColumnIfMissing = (table: string, column: string, ddl: string) => {
    const existing = db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((row: any) => row.name);
    if (!existing.includes(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
      logger.info(`Added column ${table}.${column}`);
    }
  };

  addColumnIfMissing(
    'research_ingest_jobs',
    'retry_count',
    "retry_count INTEGER NOT NULL DEFAULT 0"
  );

  addColumnIfMissing(
    'articles',
    'summary_text',
    'summary_text TEXT'
  );
  addColumnIfMissing(
    'articles',
    'tags_json',
    'tags_json TEXT'
  );
  addColumnIfMissing(
    'articles',
    'is_favorite',
    'is_favorite INTEGER NOT NULL DEFAULT 0'
  );
  const addColumnIfMissingNoDefault = (table: string, column: string, ddl: string) => {
    const existing = db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((row: any) => row.name);
    if (!existing.includes(column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
      logger.info(`Added column ${table}.${column}`);
    }
  };

  addColumnIfMissingNoDefault(
    'articles',
    'updated_at',
    'updated_at TEXT'
  );
  db.exec(`UPDATE articles SET updated_at = datetime('now') WHERE updated_at IS NULL`);

  // Multi-topic platform: government level tracking on legislation
  addColumnIfMissing('legislation', 'government_level', 'government_level TEXT');
  addColumnIfMissing('legislation', 'jurisdiction', 'jurisdiction TEXT');
  db.exec(`
    UPDATE legislation SET government_level = 'federal', jurisdiction = 'US'
      WHERE source = 'congress' AND government_level IS NULL;
    UPDATE legislation SET government_level = 'state', jurisdiction = 'WA'
      WHERE source = 'wa_legislature' AND government_level IS NULL;
    UPDATE legislation SET government_level = 'state', jurisdiction = 'OR'
      WHERE source = 'or_legislature' AND government_level IS NULL;
  `);

  db.exec(`
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
  `);

  // Seed default alert rules if none exist
  const ruleCount = db.prepare('SELECT COUNT(*) as count FROM alert_rules').get() as { count: number };
  if (ruleCount.count === 0) {
    const insert = db.prepare(
      'INSERT INTO alert_rules (name, type, conditions) VALUES (?, ?, ?)'
    );

    const defaultRules = [
      {
        name: 'New PFAS Bill (WA/OR)',
        type: 'new_bill',
        conditions: JSON.stringify({ sources: ['wa_legislature', 'or_legislature'], minRelevance: 0.5 }),
      },
      {
        name: 'Bill Status Change',
        type: 'bill_status_change',
        conditions: JSON.stringify({ statuses: ['passed_committee', 'passed_chamber', 'signed'] }),
      },
      {
        name: 'Contract Deadline (14 days)',
        type: 'contract_deadline',
        conditions: JSON.stringify({ daysThreshold: 14 }),
      },
      {
        name: 'Contract Deadline (7 days)',
        type: 'contract_deadline',
        conditions: JSON.stringify({ daysThreshold: 7 }),
      },
      {
        name: 'Contract Deadline (3 days)',
        type: 'contract_deadline',
        conditions: JSON.stringify({ daysThreshold: 3 }),
      },
      {
        name: 'High-Relevance Contract',
        type: 'new_contract',
        conditions: JSON.stringify({ minRelevance: 0.7 }),
      },
      {
        name: 'Social Volume Spike (2x)',
        type: 'social_spike',
        conditions: JSON.stringify({ multiplier: 2 }),
      },
      {
        name: 'Social Volume Spike (3x)',
        type: 'social_spike',
        conditions: JSON.stringify({ multiplier: 3 }),
      },
    ];

    const insertMany = db.transaction(() => {
      for (const rule of defaultRules) {
        insert.run(rule.name, rule.type, rule.conditions);
      }
    });
    insertMany();
    logger.info(`Seeded ${defaultRules.length} default alert rules`);
  }

  // Seed default topics if none exist
  const topicCount = (db.prepare('SELECT COUNT(*) as c FROM topics').get() as { c: number }).c;
  if (topicCount === 0) {
    const insertTopic = db.prepare(
      `INSERT INTO topics (name, slug, description, keywords_json, category_weights_json)
       VALUES (?, ?, ?, ?, ?)`
    );

    const pfasKeywords = {
      primary: ['PFAS', 'PFOA', 'PFOS', 'GenX', 'per- and polyfluoroalkyl', 'polyfluoroalkyl substances', 'perfluoroalkyl', 'forever chemicals'],
      environmental: ['groundwater contamination', 'drinking water contamination', 'water quality', 'soil contamination', 'environmental remediation', 'biosolids', 'leachate', 'aquifer'],
      testing: ['environmental testing', 'water testing', 'EPA method 533', 'EPA method 537'],
      regulatory: ['MCL', 'maximum contaminant level', 'EPA regulation', 'EPA ruling', 'cleanup standard', 'CERCLA', 'Superfund', 'MTCA', 'Model Toxics Control Act'],
      regional: ['Washington state environmental', 'Oregon environmental', 'Pacific Northwest', 'Puget Sound', 'Columbia River', 'Department of Ecology', 'DEQ Oregon'],
    };

    const pfasWeights = { primary: 1.0, environmental: 0.6, testing: 0.7, regulatory: 0.8, regional: 0.4 };

    const roundupKeywords = {
      primary: ['Roundup', 'glyphosate', 'Ranger Pro', 'Rodeo herbicide'],
      health: ['non-Hodgkin lymphoma', 'cancer risk', 'carcinogen', 'IARC', 'endocrine disrupt'],
      regulatory: ['EPA registration', 'herbicide approval', 'pesticide regulation', 'FIFRA', 'pesticide label'],
      corporate: ['Bayer', 'Monsanto', 'Bayer Crop Science'],
      environmental: ['spray drift', 'soil microbiome', 'pollinator', 'bee colony', 'weed resistance', 'superweeds'],
      regional: ['Washington state agriculture', 'Oregon farm', 'Pacific Northwest farm', 'agricultural runoff'],
    };

    const roundupWeights = { primary: 1.0, health: 0.9, regulatory: 0.8, corporate: 0.7, environmental: 0.6, regional: 0.4 };

    const chemKeywords = {
      primary: ['toxic chemicals', 'hazardous substances', 'chemical contamination', 'industrial chemicals', 'synthetic chemicals'],
      regulatory: ['Toxic Substances Control Act', 'TSCA', 'chemical safety', 'EPA chemical', 'toxic release', 'TRI'],
      environmental: ['pollution', 'contamination', 'remediation', 'superfund site', 'brownfield'],
      health: ['bioaccumulation', 'endocrine disruptor', 'neurotoxin', 'carcinogen', 'public health'],
      regional: ['Pacific Northwest pollution', 'Washington pollution', 'Oregon pollution'],
    };

    const chemWeights = { primary: 1.0, regulatory: 0.8, environmental: 0.6, health: 0.7, regional: 0.4 };

    const seedTopics = db.transaction(() => {
      insertTopic.run('PFAS', 'pfas', 'Per- and polyfluoroalkyl substances — tracking contamination, legislation, and remediation efforts', JSON.stringify(pfasKeywords), JSON.stringify(pfasWeights));
      insertTopic.run('Roundup / Glyphosate', 'roundup', 'Glyphosate-based herbicide regulation, health research, and corporate accountability', JSON.stringify(roundupKeywords), JSON.stringify(roundupWeights));
      insertTopic.run('Environmental Chemicals', 'environmental-chemicals', 'Broad tracking of industrial and synthetic chemical regulation, contamination, and remediation', JSON.stringify(chemKeywords), JSON.stringify(chemWeights));
    });
    seedTopics();
    logger.info('Seeded 3 default topics');
  }

  // Backfill topic_items for existing data using PFAS topic (id=1)
  const backfillCount = (db.prepare('SELECT COUNT(*) as c FROM topic_items').get() as { c: number }).c;
  if (backfillCount === 0) {
    db.exec(`
      INSERT OR IGNORE INTO topic_items (topic_id, item_type, item_id, relevance_score)
        SELECT 1, 'article', id, relevance_score FROM articles WHERE relevance_score > 0;
      INSERT OR IGNORE INTO topic_items (topic_id, item_type, item_id, relevance_score)
        SELECT 1, 'legislation', id, relevance_score FROM legislation WHERE relevance_score > 0;
      INSERT OR IGNORE INTO topic_items (topic_id, item_type, item_id, relevance_score)
        SELECT 1, 'contract', id, relevance_score FROM contracts WHERE relevance_score > 0;
      INSERT OR IGNORE INTO topic_items (topic_id, item_type, item_id, relevance_score)
        SELECT 1, 'social_post', id, relevance_score FROM social_posts WHERE relevance_score > 0;
    `);
    logger.info('Backfilled topic_items for existing data');
  }

  logger.info('Database migrations complete');
}

// Run directly if called as script
if (require.main === module) {
  runMigrations();
  closeDb();
  console.log('Migration complete.');
}

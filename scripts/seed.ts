import { getDb, closeDb } from '../src/db/connection';
import { runMigrations } from '../src/db/migrate';

runMigrations();
const db = getDb();

// Seed sample legislation
const insertLegislation = db.prepare(`
  INSERT OR IGNORE INTO legislation (source, external_id, bill_number, title, summary, status, chamber, sponsor, introduced_date, last_action_date, url, relevance_score, keywords_matched)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const bills = [
  {
    source: 'congress', external_id: '118-HR2377', bill_number: 'HR2377',
    title: 'PFAS Action Act of 2024', summary: 'To require the EPA to designate PFAS as hazardous substances under CERCLA.',
    status: 'in_committee', chamber: 'House', sponsor: 'Rep. Debbie Dingell',
    introduced_date: '2024-03-15', last_action_date: '2024-06-20',
    url: 'https://www.congress.gov/bill/118th-congress/house-bill/2377', relevance_score: 0.95,
    keywords_matched: JSON.stringify(['PFAS', 'CERCLA', 'EPA regulation', 'forever chemicals']),
  },
  {
    source: 'congress', external_id: '118-S1430', bill_number: 'S1430',
    title: 'Clean Water Standards for PFAS Act', summary: 'Establishes federal drinking water standards for PFAS chemicals.',
    status: 'introduced', chamber: 'Senate', sponsor: 'Sen. Kirsten Gillibrand',
    introduced_date: '2024-05-01', last_action_date: '2024-05-10',
    url: 'https://www.congress.gov/bill/118th-congress/senate-bill/1430', relevance_score: 0.88,
    keywords_matched: JSON.stringify(['PFAS', 'drinking water contamination', 'maximum contaminant level']),
  },
  {
    source: 'wa_legislature', external_id: 'WA-HB1805', bill_number: 'HB1805',
    title: 'Washington PFAS-Free Firefighting Foam Act', summary: 'Prohibits use of PFAS-containing firefighting foam in Washington state.',
    status: 'passed_committee', chamber: 'House', sponsor: 'Rep. Liz Berry',
    introduced_date: '2024-01-15', last_action_date: '2024-04-02',
    url: 'https://app.leg.wa.gov/billsummary?BillNumber=1805&Year=2024', relevance_score: 0.92,
    keywords_matched: JSON.stringify(['PFAS', 'Washington state environmental', 'Department of Ecology']),
  },
  {
    source: 'or_legislature', external_id: 'OR-SB1567', bill_number: 'SB1567',
    title: 'Oregon Environmental Testing Standards Update', summary: 'Updates environmental testing requirements for water and soil in Oregon.',
    status: 'introduced', chamber: 'Senate', sponsor: 'Sen. Jeff Golden',
    introduced_date: '2024-02-01', last_action_date: '2024-03-15',
    url: 'https://olis.oregonlegislature.gov/liz/2024R1/Measures/Overview/SB1567', relevance_score: 0.72,
    keywords_matched: JSON.stringify(['environmental testing', 'water testing', 'DEQ Oregon']),
  },
];

for (const bill of bills) {
  insertLegislation.run(
    bill.source, bill.external_id, bill.bill_number, bill.title, bill.summary,
    bill.status, bill.chamber, bill.sponsor, bill.introduced_date, bill.last_action_date,
    bill.url, bill.relevance_score, bill.keywords_matched
  );
}

// Seed sample contracts
const insertContract = db.prepare(`
  INSERT OR IGNORE INTO contracts (notice_id, title, description, agency, office, naics_code, response_deadline, posted_date, url, relevance_score, keywords_matched)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const contracts = [
  {
    notice_id: 'W912DQ-24-R-0042', title: 'PFAS Site Investigation and Remediation Services',
    description: 'Comprehensive PFAS investigation and remediation at Joint Base Lewis-McChord, WA.',
    agency: 'Department of Defense', office: 'US Army Corps of Engineers',
    naics_code: '562910', response_deadline: '2025-03-15', posted_date: '2025-01-20',
    url: 'https://sam.gov/opp/example1/view', relevance_score: 0.95,
    keywords_matched: JSON.stringify(['PFAS', 'environmental remediation', 'soil contamination']),
  },
  {
    notice_id: 'EPA-R10-2024-0089', title: 'Environmental Water Quality Testing - Pacific Northwest',
    description: 'Water quality testing services for EPA Region 10 covering Washington and Oregon.',
    agency: 'Environmental Protection Agency', office: 'Region 10',
    naics_code: '541380', response_deadline: '2025-02-28', posted_date: '2025-01-15',
    url: 'https://sam.gov/opp/example2/view', relevance_score: 0.82,
    keywords_matched: JSON.stringify(['water testing', 'environmental testing', 'Pacific Northwest']),
  },
  {
    notice_id: 'VA-257-24-R-1234', title: 'Mold Assessment and Remediation Services',
    description: 'Mold inspection and remediation for VA facilities in the Pacific Northwest region.',
    agency: 'Department of Veterans Affairs', office: 'VISN 20',
    naics_code: '562910', response_deadline: '2025-04-01', posted_date: '2025-02-01',
    url: 'https://sam.gov/opp/example3/view', relevance_score: 0.68,
    keywords_matched: JSON.stringify(['mold remediation', 'mold inspection']),
  },
];

for (const c of contracts) {
  insertContract.run(
    c.notice_id, c.title, c.description, c.agency, c.office,
    c.naics_code, c.response_deadline, c.posted_date, c.url, c.relevance_score, c.keywords_matched
  );
}

// Seed sample articles
const insertArticle = db.prepare(`
  INSERT OR IGNORE INTO articles (source, external_id, title, description, url, published_at, region, relevance_score, keywords_matched)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const articles = [
  {
    source: 'PFAS News', external_id: 'a001', title: 'EPA Finalizes Strict PFAS Drinking Water Limits',
    description: 'The EPA has finalized new maximum contaminant levels for PFAS chemicals in drinking water, affecting utilities nationwide.',
    url: 'https://example.com/epa-pfas-limits', published_at: '2025-02-05T12:00:00Z', region: null,
    relevance_score: 0.93, keywords_matched: JSON.stringify(['PFAS', 'maximum contaminant level', 'EPA regulation', 'drinking water contamination']),
  },
  {
    source: 'Water Contamination PNW', external_id: 'a002', title: 'Tacoma Water Utility Reports PFAS Detection in Wells',
    description: 'Multiple wells in the Tacoma area show PFAS levels above the new federal limits, prompting emergency response.',
    url: 'https://example.com/tacoma-pfas', published_at: '2025-02-04T09:00:00Z', region: 'WA',
    relevance_score: 0.90, keywords_matched: JSON.stringify(['PFAS', 'groundwater contamination', 'Puget Sound']),
  },
  {
    source: 'Mold Remediation', external_id: 'a003', title: 'PNW Winter Storms Drive Surge in Mold Remediation Requests',
    description: 'Environmental testing companies across Washington and Oregon report a 40% increase in mold inspection bookings.',
    url: 'https://example.com/pnw-mold', published_at: '2025-02-03T15:00:00Z', region: 'PNW',
    relevance_score: 0.65, keywords_matched: JSON.stringify(['mold remediation', 'mold inspection', 'Pacific Northwest']),
  },
  {
    source: 'Environmental Testing', external_id: 'a004', title: 'Oregon DEQ Updates Environmental Testing Standards for 2025',
    description: 'New testing requirements for soil and water samples take effect, impacting environmental consulting firms.',
    url: 'https://example.com/oregon-deq', published_at: '2025-02-02T11:00:00Z', region: 'OR',
    relevance_score: 0.75, keywords_matched: JSON.stringify(['environmental testing', 'DEQ Oregon', 'soil contamination']),
  },
  {
    source: 'EPA News', external_id: 'a005', title: 'Superfund Sites in Washington State Receive Additional Funding',
    description: 'Three Superfund sites in Washington will receive $45M for PFAS-related cleanup activities.',
    url: 'https://example.com/wa-superfund', published_at: '2025-02-01T08:00:00Z', region: 'WA',
    relevance_score: 0.88, keywords_matched: JSON.stringify(['PFAS', 'Superfund', 'environmental remediation', 'Washington state environmental']),
  },
];

for (const a of articles) {
  insertArticle.run(a.source, a.external_id, a.title, a.description, a.url, a.published_at, a.region, a.relevance_score, a.keywords_matched);
}

// Seed sample social posts
const insertPost = db.prepare(`
  INSERT OR IGNORE INTO social_posts (platform, external_id, subreddit, author, title, body, url, score, num_comments, relevance_score, keywords_matched, posted_at)
  VALUES ('reddit', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const posts = [
  { external_id: 'r001', subreddit: 'Seattle', author: 'seattleite42', title: 'PFAS found in local drinking water - should I be worried?', body: 'Just read that our water utility detected PFAS. Has anyone gotten their water independently tested?', url: 'https://reddit.com/r/Seattle/comments/r001', score: 245, num_comments: 67, relevance_score: 0.85, keywords_matched: JSON.stringify(['PFAS', 'drinking water contamination', 'water testing']), posted_at: '2025-02-06T14:00:00Z' },
  { external_id: 'r002', subreddit: 'environment', author: 'eco_warrior', title: 'New EPA PFAS regulations: What they mean for your community', body: 'The EPA just finalized strict MCLs for PFAS. Here is what you need to know about the new maximum contaminant levels.', url: 'https://reddit.com/r/environment/comments/r002', score: 1230, num_comments: 189, relevance_score: 0.92, keywords_matched: JSON.stringify(['PFAS', 'EPA regulation', 'maximum contaminant level', 'forever chemicals']), posted_at: '2025-02-05T20:00:00Z' },
  { external_id: 'r003', subreddit: 'Portland', author: 'pdx_neighbor', title: 'Mold in apartment - landlord won\'t fix', body: 'Found significant mold growth in bathroom. Landlord says it is cosmetic. Anyone have experience with mold inspectors in Portland?', url: 'https://reddit.com/r/Portland/comments/r003', score: 89, num_comments: 42, relevance_score: 0.55, keywords_matched: JSON.stringify(['mold inspection', 'mold remediation']), posted_at: '2025-02-05T10:00:00Z' },
  { external_id: 'r004', subreddit: 'washington', author: 'wa_outdoors', title: 'Columbia River cleanup progress update', body: 'The latest Superfund status report shows remediation is ahead of schedule for the Columbia River site.', url: 'https://reddit.com/r/washington/comments/r004', score: 167, num_comments: 23, relevance_score: 0.72, keywords_matched: JSON.stringify(['Superfund', 'environmental remediation', 'Columbia River']), posted_at: '2025-02-04T16:00:00Z' },
  { external_id: 'r005', subreddit: 'WaterTreatment', author: 'water_tech', title: 'EPA Method 533 vs 537.1 for PFAS testing', body: 'For those doing PFAS analysis: what are your thoughts on 533 vs 537.1? We are seeing different results with each method.', url: 'https://reddit.com/r/WaterTreatment/comments/r005', score: 56, num_comments: 31, relevance_score: 0.95, keywords_matched: JSON.stringify(['PFAS', 'EPA method 533', 'water testing', 'environmental testing']), posted_at: '2025-02-03T12:00:00Z' },
  { external_id: 'r006', subreddit: 'Tacoma', author: 'tacoma_mom', title: 'Well water testing recommendations near JBLM?', body: 'We live near Joint Base Lewis-McChord and want to test our well for PFAS and other contaminants. Any local lab recommendations?', url: 'https://reddit.com/r/Tacoma/comments/r006', score: 34, num_comments: 18, relevance_score: 0.88, keywords_matched: JSON.stringify(['PFAS', 'water testing', 'groundwater contamination']), posted_at: '2025-02-02T09:00:00Z' },
];

for (const p of posts) {
  insertPost.run(p.external_id, p.subreddit, p.author, p.title, p.body, p.url, p.score, p.num_comments, p.relevance_score, p.keywords_matched, p.posted_at);
}

// Seed daily stats
const insertStats = db.prepare(`
  INSERT OR IGNORE INTO social_daily_stats (platform, subreddit, date, post_count, comment_count, avg_score)
  VALUES ('reddit', ?, ?, ?, ?, ?)
`);

const today = new Date();
for (let i = 30; i >= 0; i--) {
  const d = new Date(today);
  d.setDate(d.getDate() - i);
  const dateStr = d.toISOString().split('T')[0];

  for (const sub of ['Seattle', 'environment', 'Portland', 'washington']) {
    const postCount = Math.floor(Math.random() * 5) + 1;
    const commentCount = Math.floor(Math.random() * 50) + 5;
    const avgScore = Math.floor(Math.random() * 200) + 10;
    insertStats.run(sub, dateStr, postCount, commentCount, avgScore);
  }
}

// Seed sample alerts
const insertAlert = db.prepare(`
  INSERT INTO alerts (rule_id, type, severity, title, message, data)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const sampleAlerts = [
  { rule_id: 1, type: 'new_bill', severity: 'critical', title: 'New Bill: HB1805', message: 'Washington PFAS-Free Firefighting Foam Act\n\nSource: wa_legislature | Relevance: 92%', data: JSON.stringify({ billId: 3 }) },
  { rule_id: 6, type: 'new_contract', severity: 'high', title: 'New High-Relevance Contract', message: 'PFAS Site Investigation and Remediation Services\n\nAgency: Department of Defense\nDeadline: 2025-03-15\nRelevance: 95%', data: JSON.stringify({ contractId: 1 }) },
  { rule_id: 3, type: 'contract_deadline', severity: 'medium', title: 'Contract Deadline: 18 days', message: 'Environmental Water Quality Testing - Pacific Northwest\n\nAgency: EPA\nDeadline: 2025-02-28', data: JSON.stringify({ contractId: 2 }) },
];

for (const a of sampleAlerts) {
  insertAlert.run(a.rule_id, a.type, a.severity, a.title, a.message, a.data);
}

// Seed collector runs
const insertRun = db.prepare(`
  INSERT INTO collector_runs (collector, status, items_found, items_new, started_at, finished_at)
  VALUES (?, 'success', ?, ?, datetime('now', ?), datetime('now', ?))
`);

const runs = [
  { collector: 'google_news', found: 45, new_items: 12, offsetStart: '-2 hours', offsetEnd: '-118 minutes' },
  { collector: 'congress', found: 20, new_items: 4, offsetStart: '-4 hours', offsetEnd: '-235 minutes' },
  { collector: 'samgov', found: 15, new_items: 3, offsetStart: '-3 hours', offsetEnd: '-175 minutes' },
  { collector: 'reddit', found: 32, new_items: 6, offsetStart: '-1 hour', offsetEnd: '-55 minutes' },
];

for (const r of runs) {
  insertRun.run(r.collector, r.found, r.new_items, r.offsetStart, r.offsetEnd);
}

console.log('Seed data inserted successfully!');
console.log(`  ${bills.length} bills`);
console.log(`  ${contracts.length} contracts`);
console.log(`  ${articles.length} articles`);
console.log(`  ${posts.length} social posts`);
console.log(`  31 days x 4 subreddits daily stats`);
console.log(`  ${sampleAlerts.length} alerts`);
console.log(`  ${runs.length} collector runs`);

closeDb();

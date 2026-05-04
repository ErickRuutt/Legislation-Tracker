// === Database row types ===

export interface Legislation {
  id: number;
  source: 'congress' | 'wa_legislature' | 'or_legislature';
  external_id: string;
  bill_number: string;
  title: string;
  summary: string | null;
  status: string;
  chamber: string | null;
  sponsor: string | null;
  introduced_date: string | null;
  last_action_date: string | null;
  url: string | null;
  relevance_score: number;
  keywords_matched: string | null;
  created_at: string;
  updated_at: string;
}

export interface LegislationHistory {
  id: number;
  legislation_id: number;
  status: string;
  description: string | null;
  action_date: string | null;
  recorded_at: string;
}

export interface Contract {
  id: number;
  notice_id: string;
  title: string;
  description: string | null;
  agency: string | null;
  office: string | null;
  naics_code: string | null;
  set_aside: string | null;
  response_deadline: string | null;
  posted_date: string | null;
  url: string | null;
  relevance_score: number;
  keywords_matched: string | null;
  created_at: string;
  updated_at: string;
}

export interface Article {
  id: number;
  source: string;
  external_id: string;
  title: string;
  description: string | null;
  content: string | null;
  author: string | null;
  url: string;
  image_url: string | null;
  published_at: string | null;
  region: string | null;
  relevance_score: number;
  keywords_matched: string | null;
  created_at: string;
}

export interface SocialPost {
  id: number;
  platform: 'reddit';
  external_id: string;
  subreddit: string | null;
  author: string | null;
  title: string | null;
  body: string | null;
  url: string | null;
  score: number;
  num_comments: number;
  sentiment: number | null;
  relevance_score: number;
  keywords_matched: string | null;
  posted_at: string | null;
  created_at: string;
}

export interface SocialDailyStats {
  id: number;
  platform: string;
  subreddit: string | null;
  date: string;
  post_count: number;
  comment_count: number;
  avg_score: number;
  avg_sentiment: number | null;
  top_keywords: string | null;
}

export interface AlertRule {
  id: number;
  name: string;
  type: string;
  conditions: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface Alert {
  id: number;
  rule_id: number | null;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  message: string;
  data: string | null;
  acknowledged: number;
  acknowledged_at: string | null;
  email_sent: number;
  created_at: string;
}

export interface CollectorRun {
  id: number;
  collector: string;
  status: 'running' | 'success' | 'error';
  items_found: number;
  items_new: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface ConfigEntry {
  key: string;
  value: string;
  updated_at: string;
}

// === API response types ===

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DashboardOverview {
  totalBills: number;
  activeBills: number;
  totalContracts: number;
  upcomingDeadlines: number;
  totalArticles: number;
  recentArticles: number;
  totalSocialPosts: number;
  unresolvedAlerts: number;
  recentAlerts: Alert[];
  recentActivity: CollectorRun[];
}

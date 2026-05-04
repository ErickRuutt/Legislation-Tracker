export const PFAS_KEYWORDS = {
  primary: [
    'PFAS', 'PFOA', 'PFOS', 'GenX',
    'per- and polyfluoroalkyl',
    'polyfluoroalkyl substances',
    'perfluoroalkyl',
    'forever chemicals',
  ],
  environmental: [
    'groundwater contamination',
    'drinking water contamination',
    'water quality',
    'soil contamination',
    'environmental remediation',
    'biosolids',
    'leachate',
    'aquifer',
  ],
  testing: [
    'environmental testing',
    'water testing',
    'mold testing',
    'mold inspection',
    'mold remediation',
    'indoor air quality',
    'radon testing',
    'lead testing',
    'asbestos testing',
    'EPA method 533',
    'EPA method 537',
  ],
  regulatory: [
    'MCL', 'maximum contaminant level',
    'EPA regulation',
    'EPA ruling',
    'cleanup standard',
    'CERCLA',
    'Superfund',
    'MTCA',
    'Model Toxics Control Act',
  ],
  regional: [
    'Washington state environmental',
    'Oregon environmental',
    'Pacific Northwest',
    'Puget Sound',
    'Columbia River',
    'Department of Ecology',
    'DEQ Oregon',
  ],
};

export const ALL_KEYWORDS = Object.values(PFAS_KEYWORDS).flat();

export const REDDIT_SUBREDDITS = [
  'environment',
  'Seattle',
  'Portland',
  'washington',
  'oregon',
  'WaterTreatment',
  'environmental_science',
  'Tacoma',
  'olympia',
  'Eugene',
  'Bellingham',
];

export const NEWS_RSS_FEEDS = [
  // Google News keyword feeds (broad signals)
  { name: 'PFAS News', url: 'https://news.google.com/rss/search?q=PFAS+contamination&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Forever Chemicals', url: 'https://news.google.com/rss/search?q=%22forever+chemicals%22&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Water Contamination PNW', url: 'https://news.google.com/rss/search?q=water+contamination+Washington+Oregon&hl=en-US&gl=US&ceid=US:en' },
  { name: 'Environmental Testing', url: 'https://news.google.com/rss/search?q=environmental+testing+regulation&hl=en-US&gl=US&ceid=US:en' },

  // EPA News Releases (national + Region 10)
  { name: 'EPA News Releases', url: 'https://www.epa.gov/newsreleases/search/rss' },
  { name: 'EPA Region 10 News', url: 'https://www.epa.gov/newsreleases/search/rss/field_press_office/region-10' },
  // EPA program feeds
  { name: 'EPA Office of Water Publications', url: 'https://nepis.epa.gov/RSS/OW.xml' },
  { name: 'EPA Chemical Safety & Pollution Prevention', url: 'https://nepis.epa.gov/RSS/OCSPP.xml' },
  { name: 'EPA Enforcement & Compliance', url: 'https://nepis.epa.gov/RSS/ECA.xml' },

  // USGS (science + water)
  { name: 'USGS News', url: 'https://www.usgs.gov/news/all/feed' },
  { name: 'USGS Water Alerts', url: 'https://water.usgs.gov/alerts/project_alert.xml' },
  { name: 'USGS Publications', url: 'https://pubs.usgs.gov/pubs-services/publication/rss/' },

  // OSHA + CDC MMWR
  { name: 'OSHA News Releases', url: 'https://www.osha.gov/news/newsreleases.xml' },
  { name: 'CDC MMWR', url: 'https://tools.cdc.gov/medialibrary/Index.aspx#/feed/id/342778' },

  // GovInfo (Federal Register / regulatory updates)
  { name: 'GovInfo Federal Register', url: 'https://www.govinfo.gov/rss/fr' },
];

export const COLLECTOR_SCHEDULES = {
  googleNews: '0 */8 * * *',      // Every 8 hours
  newsApi: '0 */6 * * *',          // Every 6 hours
  congress: '0 */6 * * *',         // Every 6 hours
  samGov: '0 */4 * * *',           // Every 4 hours
  reddit: '0 */3 * * *',           // Every 3 hours
};

export const DIGEST_SCHEDULES = {
  daily: '30 7 * * *',   // 7:30 AM daily
  weekly: '0 8 * * 1',   // 8:00 AM Mondays
  monthly: '0 9 1 * *',  // 9:00 AM first of month
};

export const NAICS_CODES = {
  environmentalConsulting: '541620',
  testingLaboratories: '541380',
  remediationServices: '562910',
  waterTreatment: '221310',
  engineeringServices: '541330',
};

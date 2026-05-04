import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  dbPath: path.resolve(__dirname, '../../data/pfas-monitor.db'),

  congressApiKey: process.env.CONGRESS_API_KEY || '',
  samGovApiKey: process.env.SAM_GOV_API_KEY || '',
  newsApiKey: process.env.NEWS_API_KEY || '',

  reddit: {
    clientId: process.env.REDDIT_CLIENT_ID || '',
    clientSecret: process.env.REDDIT_CLIENT_SECRET || '',
    username: process.env.REDDIT_USERNAME || '',
    password: process.env.REDDIT_PASSWORD || '',
  },

  openaiApiKey: process.env.OPENAI_API_KEY || '',

  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromEmail: process.env.ALERT_FROM_EMAIL || '',
    toEmail: process.env.ALERT_TO_EMAIL || '',
  },
};

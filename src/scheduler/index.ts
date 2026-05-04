import cron from 'node-cron';
import { COLLECTOR_SCHEDULES, DIGEST_SCHEDULES } from '../shared/constants';
import { logger } from '../shared/logger';
import {
  GoogleNewsCollector,
  NewsApiCollector,
  CongressCollector,
  SamGovCollector,
  RedditCollector,
} from '../collectors';
import { generateNewsDigest } from '../analysis/digests';

interface ScheduledJob {
  name: string;
  schedule: string;
  task: cron.ScheduledTask;
}

const jobs: ScheduledJob[] = [];

export function startScheduler(): void {
  logger.info('Starting scheduler...');

  const collectors = [
    { name: 'Google News', schedule: COLLECTOR_SCHEDULES.googleNews, Collector: GoogleNewsCollector },
    { name: 'NewsAPI', schedule: COLLECTOR_SCHEDULES.newsApi, Collector: NewsApiCollector },
    { name: 'Congress.gov', schedule: COLLECTOR_SCHEDULES.congress, Collector: CongressCollector },
    { name: 'SAM.gov', schedule: COLLECTOR_SCHEDULES.samGov, Collector: SamGovCollector },
    { name: 'Reddit', schedule: COLLECTOR_SCHEDULES.reddit, Collector: RedditCollector },
  ];

  for (const { name, schedule, Collector } of collectors) {
    const task = cron.schedule(schedule, async () => {
      try {
        const collector = new Collector();
        await collector.execute();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Scheduled job [${name}] crashed: ${msg}`);
      }
    });

    jobs.push({ name, schedule, task });
    logger.info(`Scheduled [${name}] with cron: ${schedule}`);
  }

  const digestJobs = [
    { name: 'Daily Digest', schedule: DIGEST_SCHEDULES.daily, period: 'daily' as const },
    { name: 'Weekly Digest', schedule: DIGEST_SCHEDULES.weekly, period: 'weekly' as const },
    { name: 'Monthly Digest', schedule: DIGEST_SCHEDULES.monthly, period: 'monthly' as const },
  ];

  for (const job of digestJobs) {
    const task = cron.schedule(job.schedule, async () => {
      try {
        await generateNewsDigest(job.period);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Scheduled job [${job.name}] crashed: ${msg}`);
      }
    });

    jobs.push({ name: job.name, schedule: job.schedule, task });
    logger.info(`Scheduled [${job.name}] with cron: ${job.schedule}`);
  }
}

export function stopScheduler(): void {
  for (const job of jobs) {
    job.task.stop();
  }
  jobs.length = 0;
  logger.info('Scheduler stopped');
}

export function getSchedulerStatus(): Array<{ name: string; schedule: string }> {
  return jobs.map(({ name, schedule }) => ({ name, schedule }));
}

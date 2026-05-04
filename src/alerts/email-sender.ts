import nodemailer from 'nodemailer';
import { config } from '../shared/config';
import { logger } from '../shared/logger';
import type { Alert } from '../shared/types';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: false,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }
  return transporter;
}

export async function sendAlertEmail(alert: Alert): Promise<boolean> {
  if (!config.smtp.user || !config.smtp.pass) {
    logger.warn('SMTP not configured, skipping email');
    return false;
  }

  const severityColors: Record<string, string> = {
    critical: '#dc2626',
    high: '#ea580c',
    medium: '#ca8a04',
    low: '#2563eb',
  };

  const color = severityColors[alert.severity] || '#6b7280';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: ${color}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">${alert.severity.toUpperCase()} Alert: ${alert.title}</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="margin: 0 0 16px; color: #374151; line-height: 1.6;">${alert.message}</p>
        <p style="margin: 0; color: #9ca3af; font-size: 12px;">
          PFAS Monitor Alert — ${new Date(alert.created_at).toLocaleString()}
        </p>
      </div>
    </div>
  `;

  try {
    await getTransporter().sendMail({
      from: config.smtp.fromEmail || config.smtp.user,
      to: config.smtp.toEmail,
      subject: `[PFAS Monitor] ${alert.severity.toUpperCase()}: ${alert.title}`,
      html,
    });
    logger.info(`Alert email sent: ${alert.title}`);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to send alert email: ${msg}`);
    return false;
  }
}

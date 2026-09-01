export const BUILD_ID = '2026-09-01.checkpoint-publisher.1';
export const SITE_TIME_ZONE = process.env.OTD_TIME_ZONE || 'America/Los_Angeles';

export function environmentStatus() {
  // Vercel Cron injects Authorization from the env var named exactly CRON_SECRET.
  // OTD_CRON_SECRET is retained only as a diagnostic legacy alias; it does NOT
  // make the scheduler ready because Vercel itself will not use that name.
  const required = {
    OPENAI_KEY: Boolean(process.env.OTD_OPENAI_KEY || process.env.OPENAI_API_KEY),
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    ADMIN_TOKEN: Boolean(process.env.OTD_ADMIN_TOKEN || process.env.ADMIN_TOKEN),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
  };
  const vercelEnvironment = process.env.VERCEL_ENV || 'unknown';
  return {
    ready: Object.values(required).every(Boolean),
    required,
    build: BUILD_ID,
    timeZone: SITE_TIME_ZONE,
    scheduler: {
      ready: Boolean(process.env.CRON_SECRET),
      secretName: 'CRON_SECRET',
      legacyAliasPresent: Boolean(process.env.OTD_CRON_SECRET),
      vercelEnvironment,
      production: vercelEnvironment === 'production',
      cadence: 'every minute',
      path: '/api/cron/newsroom',
    },
    models: {
      research: process.env.OTD_RESEARCH_MODEL || 'gpt-5.6-luna',
      verify: process.env.OTD_VERIFY_MODEL || 'gpt-5.6-terra',
      editor: process.env.OTD_EDITOR_MODEL || 'gpt-5.6-terra',
    },
    siteUrl: process.env.PUBLIC_SITE_URL || 'https://www.onthisday.tv',
    socialWebhook: Boolean(process.env.SOCIAL_WEBHOOK_URL),
    social: {
      youtube: Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REFRESH_TOKEN),
      facebook: Boolean(process.env.FACEBOOK_PAGE_ID && process.env.META_ACCESS_TOKEN),
      instagram: Boolean(process.env.INSTAGRAM_ACCOUNT_ID && process.env.META_ACCESS_TOKEN),
      threads: Boolean(process.env.THREADS_USER_ID && process.env.META_ACCESS_TOKEN),
      tiktok: Boolean(process.env.TIKTOK_ACCESS_TOKEN && process.env.TIKTOK_OPEN_ID),
      x: Boolean(process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_TOKEN_SECRET),
    },
  };
}

export function assertCoreEnvironment() {
  const status = environmentStatus();
  const missing = Object.entries(status.required).filter(([,v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  return status;
}

export const AGENT_VERSION = '2026-08-29.1';

export function environmentStatus() {
  const required = {
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    ADMIN_TOKEN: Boolean(process.env.ADMIN_TOKEN),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
  };
  const social = {
    SOCIAL_WEBHOOK_URL: Boolean(process.env.SOCIAL_WEBHOOK_URL),
    youtube: Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REFRESH_TOKEN),
    facebook: Boolean(process.env.FACEBOOK_PAGE_ID && process.env.META_ACCESS_TOKEN),
    instagram: Boolean(process.env.INSTAGRAM_ACCOUNT_ID && process.env.META_ACCESS_TOKEN),
    threads: Boolean(process.env.THREADS_USER_ID && process.env.META_ACCESS_TOKEN),
    tiktok: Boolean(process.env.TIKTOK_ACCESS_TOKEN && process.env.TIKTOK_OPEN_ID),
    x: Boolean(process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_TOKEN_SECRET),
  };
  return {
    ready: Object.values(required).every(Boolean),
    required,
    social,
    model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
    verifyModel: process.env.OPENAI_VERIFY_MODEL || 'gpt-5.6-terra',
    siteUrl: process.env.PUBLIC_SITE_URL || 'https://www.onthisday.tv',
  };
}

export function assertCoreEnvironment() {
  const status = environmentStatus();
  const missing = Object.entries(status.required).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  return status;
}

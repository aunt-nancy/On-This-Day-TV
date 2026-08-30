import { environmentStatus } from './config.js';

export async function dispatchPosts(posts, edition) {
  const env = environmentStatus();
  const results = [];

  for (const post of posts || []) {
    const platform = String(post.platform || '').toLowerCase();
    if (process.env.SOCIAL_WEBHOOK_URL) {
      try {
        const response = await fetch(process.env.SOCIAL_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.SOCIAL_WEBHOOK_SECRET ? { Authorization: `Bearer ${process.env.SOCIAL_WEBHOOK_SECRET}` } : {}),
          },
          body: JSON.stringify({ platform, post, edition }),
        });
        results.push({ platform, status: response.ok ? 'sent_to_webhook' : 'webhook_error', httpStatus: response.status });
      } catch (error) {
        results.push({ platform, status: 'webhook_error', error: error.message });
      }
      continue;
    }

    const connected = Boolean(env.social[platform]);
    results.push({
      platform,
      status: connected ? 'adapter_ready_not_executed' : 'waiting_credentials',
      note: connected
        ? 'Credentials detected. Direct platform adapter can be completed after platform approval/scopes are confirmed.'
        : 'Post generated and queued; platform credentials/API approval are not configured.',
    });
  }
  return results;
}

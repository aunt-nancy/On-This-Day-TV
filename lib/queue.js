import { QueueClient } from '@vercel/queue';

// The current Vercel deployment runs in iad1. Keeping the queue in one fixed
// region prevents an agent chain from being split across regional topics.
const queue = new QueueClient({ region: 'iad1' });

export const { send, handleNodeCallback } = queue;

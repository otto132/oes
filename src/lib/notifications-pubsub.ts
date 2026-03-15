// src/lib/notifications-pubsub.ts
// SSE notification delivery with pluggable backend.
// Set REDIS_URL to use Redis pub/sub for horizontal scaling.
// Without it, falls back to in-memory (single-server only).

import { logger } from '@/lib/logger';

// ── Local subscriber registry (always needed for SSE delivery) ──

const subscribers = new Map<string, Set<ReadableStreamDefaultController>>();

export function subscribe(userId: string, controller: ReadableStreamDefaultController): void {
  if (!subscribers.has(userId)) {
    subscribers.set(userId, new Set());
  }
  subscribers.get(userId)!.add(controller);
}

export function unsubscribe(userId: string, controller: ReadableStreamDefaultController): void {
  const set = subscribers.get(userId);
  if (!set) return;
  set.delete(controller);
  if (set.size === 0) subscribers.delete(userId);
}

function deliverLocally(userId: string, event: string, data: unknown): void {
  const set = subscribers.get(userId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(payload);
  for (const controller of set) {
    try {
      controller.enqueue(encoded);
    } catch {
      // Controller closed — clean up on next unsubscribe
    }
  }
}

// ── Redis pub/sub adapter ──
// To enable: npm install ioredis, set REDIS_URL env var.
// When Redis is configured, publishToUser broadcasts to all instances,
// each instance delivers to its local SSE subscribers.

let redisReady = false;

async function initRedis(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;

  try {
    // Dynamic import so ioredis is optional — use require to avoid TS module resolution
    const Redis = require('ioredis') as new (url: string) => {
      publish(channel: string, message: string): Promise<number>;
      subscribe(channel: string, cb: (err: Error | null) => void): void;
      on(event: string, cb: (...args: string[]) => void): void;
    };
    const pub = new Redis(redisUrl);
    const sub = new Redis(redisUrl);

    sub.subscribe('sse:notify', (err: Error | null) => {
      if (err) logger.error('[pubsub] Redis subscribe error', { error: err.message });
    });

    sub.on('message', (_channel: string, message: string) => {
      try {
        const { userId, event, data } = JSON.parse(message);
        deliverLocally(userId, event, data);
      } catch {
        // Malformed message — ignore
      }
    });

    // Replace the publish function
    publishImpl = (userId: string, event: string, data: unknown) => {
      pub.publish('sse:notify', JSON.stringify({ userId, event, data })).catch(() => {});
    };

    redisReady = true;
    logger.info('[pubsub] Redis pub/sub connected');
  } catch {
    logger.warn('[pubsub] ioredis not installed or Redis unavailable — using in-memory pub/sub');
  }
}

// Lazy init on first publish
let initPromise: Promise<void> | null = null;
let publishImpl = deliverLocally;

export function publishToUser(userId: string, event: string, data: unknown): void {
  if (!redisReady && process.env.REDIS_URL && !initPromise) {
    initPromise = initRedis();
  }
  publishImpl(userId, event, data);
}

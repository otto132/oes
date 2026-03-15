// src/lib/notifications-pubsub.ts
// Single-server in-memory pub/sub for SSE notification delivery.
// For horizontal scaling, swap to Redis pub/sub.

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

export function publishToUser(userId: string, event: string, data: unknown): void {
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

// src/app/api/notifications/stream/route.ts
import { auth } from '@/lib/auth';
import { subscribe, unsubscribe } from '@/lib/notifications-pubsub';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }
  const userId = session.user.id;
  const encoder = new TextEncoder();

  let controllerRef: ReadableStreamDefaultController;
  let heartbeatInterval: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      controllerRef = controller;
      subscribe(userId, controller);
      controller.enqueue(encoder.encode('event: connected\ndata: {}\n\n'));
      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(heartbeatInterval);
        }
      }, 30_000);
    },
    cancel() {
      clearInterval(heartbeatInterval);
      unsubscribe(userId, controllerRef);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

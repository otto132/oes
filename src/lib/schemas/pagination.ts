import { NextRequest } from 'next/server';

export interface PaginationParams {
  cursor?: string;
  limit: number;
}

export function parsePagination(req: NextRequest): PaginationParams {
  const url = req.nextUrl;
  const cursor = url.searchParams.get('cursor') ?? undefined;
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const limit = Math.min(Math.max(rawLimit || 50, 1), 100);
  return { cursor, limit };
}

export function paginate<T extends { id: string }>(
  items: T[],
  limit: number,
): { data: T[]; meta: { cursor?: string; hasMore: boolean } } {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const cursor = hasMore && data.length > 0 ? data[data.length - 1].id : undefined;
  return { data, meta: { cursor, hasMore } };
}

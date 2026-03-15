import Anthropic from '@anthropic-ai/sdk';
import { db as prisma } from '@/lib/db';

export const MODEL_SONNET = 'claude-sonnet-4-6';
export const MODEL_HAIKU = 'claude-haiku-4-5';

const VALID_MODELS = [MODEL_SONNET, MODEL_HAIKU] as const;

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
    client = new Anthropic({ apiKey });
  }
  return client;
}

/** Reset singleton — only for testing */
export function _resetClient(): void {
  client = null;
}

// ── Pricing ─────────────────────────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
  [MODEL_SONNET]: { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  [MODEL_HAIKU]:  { input: 0.80 / 1_000_000, output: 4 / 1_000_000 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model] ?? PRICING[MODEL_SONNET];
  return inputTokens * p.input + outputTokens * p.output;
}

// ── Guard errors ────────────────────────────────────────────

export class SpendCapExceededError extends Error {
  constructor(public currentUsd: number, public capUsd: number) {
    super(`Daily spend cap exceeded: $${currentUsd.toFixed(2)} / $${capUsd.toFixed(2)}`);
    this.name = 'SpendCapExceededError';
  }
}

export class RunLimitExceededError extends Error {
  constructor(public agentName: string, public runsToday: number, public maxRuns: number) {
    super(`Run limit exceeded for ${agentName}: ${runsToday}/${maxRuns}`);
    this.name = 'RunLimitExceededError';
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(public agentName: string) {
    super(`Circuit breaker open for ${agentName}: last 3 runs failed`);
    this.name = 'CircuitBreakerOpenError';
  }
}

// ── Guards ───────────────────────────────────────────────────

function startOfDay(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function checkSpendCap(agentName?: string): Promise<void> {
  const capStr = process.env.AI_DAILY_SPEND_CAP_USD;
  const cap = capStr ? parseFloat(capStr) : 10;
  if (!cap || cap <= 0) return;

  const where: Record<string, unknown> = { createdAt: { gte: startOfDay() } };
  if (agentName) where.agentName = agentName;

  const result = await prisma.aiUsageLog.aggregate({
    where,
    _sum: { estimatedCostUsd: true },
  });

  const current = result._sum.estimatedCostUsd ?? 0;
  if (current >= cap) throw new SpendCapExceededError(current, cap);
}

export async function checkRunLimit(agentName: string): Promise<void> {
  const config = await prisma.agentConfig.findUnique({ where: { name: agentName } });
  const params = (config?.parameters as Record<string, unknown>) ?? {};
  const maxRuns = Number(params.maxRunsPerDay) || 0;
  if (!maxRuns) return; // no limit configured

  const runsToday = await prisma.agentRun.count({
    where: { agentName, startedAt: { gte: startOfDay() } },
  });

  if (runsToday >= maxRuns) throw new RunLimitExceededError(agentName, runsToday, maxRuns);
}

export async function checkCircuitBreaker(agentName: string): Promise<void> {
  const lastRuns = await prisma.agentRun.findMany({
    where: { agentName },
    orderBy: { startedAt: 'desc' },
    take: 3,
    select: { status: true },
  });

  if (lastRuns.length >= 3 && lastRuns.every((r) => r.status === 'failed')) {
    throw new CircuitBreakerOpenError(agentName);
  }
}

// ── Usage logging ───────────────────────────────────────────

export async function logUsage(
  agentName: string,
  model: string,
  response: { usage?: { input_tokens?: number | null; output_tokens?: number | null; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null } },
  durationMs: number,
  trigger?: string,
): Promise<void> {
  const usage = response.usage ?? {};
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;
  const cost = estimateCost(model, inputTokens, outputTokens);

  await prisma.aiUsageLog.create({
    data: {
      agentName,
      model,
      inputTokens,
      outputTokens,
      cacheRead,
      cacheCreation,
      estimatedCostUsd: cost,
      durationMs,
      trigger,
    },
  });
}

// ── Prompt injection defense ────────────────────────────────

/**
 * Sanitize user-controlled strings before interpolation into prompts.
 * Strips characters commonly used in prompt injection attempts and
 * truncates to a reasonable length.
 */
export function sanitizeForPrompt(input: string | null | undefined, maxLen = 500): string {
  if (!input) return '';
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // strip control chars (keep \n, \r, \t)
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')              // strip XML/HTML tags
    .slice(0, maxLen);
}

// ── Model selection ─────────────────────────────────────────

export function getModelForAgent(config: { parameters?: unknown } | null, defaultModel: string): string {
  const params = (config?.parameters as Record<string, unknown>) ?? {};
  const override = params.model as string | undefined;
  if (override && VALID_MODELS.includes(override as typeof VALID_MODELS[number])) return override;
  return defaultModel;
}

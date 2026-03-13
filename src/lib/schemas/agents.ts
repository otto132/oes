import { z } from 'zod';

export const updateAgentConfigSchema = z.object({
  status: z.enum(['active', 'paused', 'disabled']).optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export const runAgentSchema = z.object({
  // No body required — agent name comes from URL param
}).optional();

export const analyticsQuerySchema = z.object({
  period: z.string().regex(/^\d+d$/).default('30d'),
});

export type UpdateAgentConfig = z.infer<typeof updateAgentConfigSchema>;

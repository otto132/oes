import { z } from 'zod';

export const createContactRoleSchema = z.object({
  label: z.string().trim().min(1, 'Label is required').max(50),
  sortOrder: z.number().int().optional(),
});

export const updateContactRoleSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(50).optional(),
  sortOrder: z.number().int().optional(),
  isArchived: z.boolean().optional(),
});

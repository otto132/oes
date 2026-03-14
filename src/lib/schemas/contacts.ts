import { z } from 'zod';

export const createContactSchema = z.object({
  name: z.string().trim().min(1, 'Contact name is required').max(200),
  title: z.string().trim().max(200).optional().default(''),
  role: z.enum(['Champion', 'EconomicBuyer', 'TechnicalBuyer', 'Influencer', 'Blocker']).optional().default('Influencer'),
  warmth: z.enum(['Strong', 'Warm', 'Cold']).optional().default('Cold'),
  email: z.string().trim().email('Invalid email format').optional().or(z.literal('')).default(''),
  phone: z.string().trim().max(50).optional(),
});

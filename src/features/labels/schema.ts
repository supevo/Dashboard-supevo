import { z } from 'zod';

const hex = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Ungültige Farbe (z. B. #3366ff).');

const intensity = z.enum(['1', '2']).default('1');

export const createLabelSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().min(1, 'Bitte gib einen Namen ein.').max(60),
  color: hex,
  description: z.string().max(280).optional().or(z.literal('')),
  isClientVisible: z.enum(['true', 'false']).default('false'),
  intensity,
});

export const updateLabelSchema = z.object({
  orgId: z.string().uuid(),
  labelId: z.string().uuid(),
  name: z.string().min(1).max(60),
  color: hex,
  description: z.string().max(280).optional().or(z.literal('')),
  isActive: z.enum(['true', 'false']),
  isClientVisible: z.enum(['true', 'false']),
  intensity,
});

export const labelIdSchema = z.object({
  orgId: z.string().uuid(),
  labelId: z.string().uuid(),
});

export const assignLabelSchema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  labelId: z.string().uuid(),
});

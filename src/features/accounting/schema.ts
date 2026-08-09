import { z } from 'zod';

const RECHTSFORM_VALUES = [
  'einzelunternehmen',
  'freiberufler',
  'gbr',
  'ug',
  'gmbh',
  'gmbh_co_kg',
  'ohg',
  'kg',
] as const;

export const accountingProfileSchema = z.object({
  billingEntityId: z.string().uuid(),
  rechtsform: z.enum(RECHTSFORM_VALUES),
  inhaber: z.string().max(200).optional(),
  ust_periode: z.enum(['monat', 'quartal']),
  hebesatz: z.string().max(12).optional(),
  weitere_einkuenfte: z.string().max(20).optional(),
  kleinunternehmer: z.boolean().default(false),
  kirchensteuer: z.boolean().default(false),
  splitting: z.boolean().default(false),
});
export type AccountingProfileInput = z.infer<typeof accountingProfileSchema>;

export const entityFolderSchema = z.object({
  billingEntityId: z.string().uuid(),
  kind: z.enum(['einnahmen', 'ausgaben']),
  folderId: z.string().min(1).max(400),
  folderPath: z.string().max(1000).optional(),
});
export type EntityFolderInput = z.infer<typeof entityFolderSchema>;

import { z } from 'zod';

export const cvmBindingStatusSchema = z.enum([
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
]);

export const cvmBindingMatchMethodSchema = z.enum([
  'CURATED_SEED',
  'CNPJ_EXACT',
  'MANUAL',
  'HEURISTIC',
]);

export const cvmShareClassSchema = z.enum([
  'ON',
  'PN',
  'PNA',
  'PNB',
  'UNT',
]);

export const proposeBindingSchema = z.object({
  companyId: z.string().uuid('companyId deve ser um UUID válido.'),
  assetId: z.string().uuid('assetId deve ser um UUID válido.'),
  shareClass: cvmShareClassSchema.nullable().optional(),
  matchMethod: cvmBindingMatchMethodSchema,
  justification: z
    .string()
    .trim()
    .min(10, 'Justificativa documental deve possuir no mínimo 10 caracteres válidos.'),
  source: z
    .string()
    .trim()
    .min(3, 'Origem do vínculo (source) deve possuir no mínimo 3 caracteres.'),
  actorId: z.string().optional().nullable(),
});

export const reviewBindingSchema = z.object({
  bindingId: z.string().uuid('bindingId deve ser um UUID válido.'),
  reviewerId: z.string().uuid('reviewerId deve ser um UUID válido.'),
  justification: z
    .string()
    .trim()
    .min(10, 'Justificativa de homologação/revisão deve possuir no mínimo 10 caracteres válidos.'),
});

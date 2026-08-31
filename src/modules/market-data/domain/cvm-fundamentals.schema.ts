import { z } from 'zod';

export const cvmStatementTypeSchema = z.enum(['CONSOLIDATED', 'INDIVIDUAL']);
export const cvmPeriodTypeSchema = z.enum(['annual', 'quarterly', 'ttm']);

export const cvmParserContextSchema = z.object({
  fileId: z.string().uuid('fileId deve ser um UUID válido.'),
  sourceFileType: z.literal('DFP_ZIP'),
  referenceYear: z.number().int().min(1900).max(2100),
  runId: z.string().uuid('runId deve ser um UUID válido.'),
  parserVersion: z.string().min(1),
});

export const rawStatementDataSchema = z.object({
  cnpj: z
    .string()
    .length(14, 'CNPJ deve possuir exatamente 14 dígitos.')
    .regex(/^\d+$/, 'CNPJ deve conter apenas dígitos numéricos.'),
  cvmCode: z
    .string()
    .length(6, 'CD_CVM deve possuir exatamente 6 dígitos.')
    .regex(/^\d+$/, 'CD_CVM deve conter apenas dígitos numéricos.'),
  companyLegalName: z.string().min(1, 'Razão Social não pode ser vazia.'),
  referenceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de referência deve estar no formato YYYY-MM-DD.'),
  periodType: z.literal('annual'),
  statementType: cvmStatementTypeSchema,
  exerciseOrder: z.literal('ÚLTIMO'),
  version: z.number().int().min(1, 'Versão do balanço deve ser >= 1.'),
  filingDate: z.union([z.date(), z.string(), z.null()]).optional(),
  sourceReference: z.string().min(10, 'sourceReference deve ser fornecido e conter dados de proveniência.'),
});

export const publishFundamentalsInputSchema = z.object({
  statements: z.array(z.any()).min(1, 'Lista de demonstrativos não pode ser vazia.'),
  context: cvmParserContextSchema.optional(),
  actorId: z.string().optional(),
  actorType: z.enum(['system', 'user']).optional(),
});

import { z } from 'zod';

export const editorialDocumentTypeEnum = z.enum([
  'EDUCATIONAL_ARTICLE',
  'INSTITUTIONAL_NOTE',
  'PRODUCT_EXPLANATION',
  'INTERNAL_DOC',
  'GLOSSARY',
  'ANNOUNCEMENT',
  'MARKET_ANALYSIS',
  'TAX_GUIDANCE',
  'OPTIONS_DERIVATIVES',
]);

export const editorialContentFormatEnum = z.enum(['MARKDOWN', 'PLAIN_TEXT']);

export const editorialVisibilityEnum = z.enum(['INTERNAL', 'PUBLIC']);

export const editorialReviewDecisionEnum = z.enum([
  'APPROVE',
  'REJECT',
  'REQUEST_CHANGES',
]);

export const editorialAiActionTypeEnum = z.enum([
  'GENERATE_DRAFT',
  'SUGGEST_TITLE',
  'SUMMARIZE',
  'SUGGEST_IMPROVEMENTS',
  'DETECT_REGULATORY_FLAGS',
  'CLASSIFY_CONTENT',
]);

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export const createEditorialDocumentSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'O título deve ter pelo menos 3 caracteres.')
    .max(200, 'O título não pode exceder 200 caracteres.'),
  slug: z
    .string()
    .trim()
    .min(2, 'O slug deve ter pelo menos 2 caracteres.')
    .max(200, 'O slug não pode exceder 200 caracteres.')
    .optional(),
  content: z
    .string()
    .min(5, 'O conteúdo deve ter pelo menos 5 caracteres.')
    .max(100000, 'O conteúdo não pode exceder 100.000 caracteres.'),
  contentFormat: editorialContentFormatEnum.default('MARKDOWN'),
  documentType: editorialDocumentTypeEnum,
  visibility: editorialVisibilityEnum.default('INTERNAL'),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});

export const updateEditorialDocumentDraftSchema = z.object({
  documentId: z.string().uuid('ID de documento inválido.'),
  title: z
    .string()
    .trim()
    .min(3, 'O título deve ter pelo menos 3 caracteres.')
    .max(200, 'O título não pode exceder 200 caracteres.'),
  content: z
    .string()
    .min(5, 'O conteúdo deve ter pelo menos 5 caracteres.')
    .max(100000, 'O conteúdo não pode exceder 100.000 caracteres.'),
  documentType: editorialDocumentTypeEnum,
  visibility: editorialVisibilityEnum.default('INTERNAL'),
  notes: z.string().max(500).optional(),
});

export const submitEditorialForReviewSchema = z.object({
  documentId: z.string().uuid('ID de documento inválido.'),
});

export const reviewEditorialDocumentSchema = z
  .object({
    documentId: z.string().uuid('ID de documento inválido.'),
    decision: editorialReviewDecisionEnum,
    comments: z.string().trim().max(2000, 'O comentário não pode exceder 2.000 caracteres.'),
  })
  .refine(
    (data) => {
      if (data.decision === 'REJECT' || data.decision === 'REQUEST_CHANGES') {
        return data.comments.length >= 5;
      }
      return true;
    },
    {
      message: 'Comentário justificativo obrigatório (mínimo de 5 caracteres) para reprovação ou solicitação de ajustes.',
      path: ['comments'],
    }
  );

export const publishEditorialDocumentSchema = z.object({
  documentId: z.string().uuid('ID de documento inválido.'),
  confirmed: z.literal(true, {
    message: 'A confirmação explícita de publicação é obrigatória.',
  }),
});

export const archiveEditorialDocumentSchema = z.object({
  documentId: z.string().uuid('ID de documento inválido.'),
});

export const editorialAiAssistantSchema = z.object({
  actionType: editorialAiActionTypeEnum,
  documentId: z.string().uuid().optional(),
  prompt: z
    .string()
    .trim()
    .min(3, 'O prompt/briefing deve ter pelo menos 3 caracteres.')
    .max(10000, 'O prompt não pode exceder 10.000 caracteres.'),
  documentType: editorialDocumentTypeEnum.optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

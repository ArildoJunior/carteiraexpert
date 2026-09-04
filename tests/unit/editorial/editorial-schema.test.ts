import { describe, it, expect } from 'vitest';
import {
  createEditorialDocumentSchema,
  updateEditorialDocumentDraftSchema,
  reviewEditorialDocumentSchema,
  publishEditorialDocumentSchema,
  slugify,
} from '../../../src/modules/editorial/domain/editorial.schema';

describe('Editorial Zod Schema Unit Tests', () => {
  describe('slugify', () => {
    it('normaliza caracteres acentuados e pontuação', () => {
      expect(slugify('Ações e Dividendos: O Guia Definitivo')).toBe(
        'acoes-e-dividendos-o-guia-definitivo'
      );
      expect(slugify('Tributação de FIIs & ETFs 2026!')).toBe(
        'tributacao-de-fiis-etfs-2026'
      );
    });
  });

  describe('createEditorialDocumentSchema', () => {
    it('valida payload correto de criação', () => {
      const valid = {
        title: 'Introdução aos Fundos Imobiliários',
        content: 'Conteúdo detalhado sobre fundos de tijolo e papel com mais de cinco caracteres.',
        documentType: 'EDUCATIONAL_ARTICLE',
        visibility: 'INTERNAL',
      };
      const parsed = createEditorialDocumentSchema.parse(valid);
      expect(parsed.title).toBe(valid.title);
      expect(parsed.contentFormat).toBe('MARKDOWN');
    });

    it('rejeita título com menos de 3 caracteres', () => {
      const invalid = {
        title: 'Ab',
        content: 'Conteúdo suficientemente longo para o teste.',
        documentType: 'EDUCATIONAL_ARTICLE',
      };
      expect(() => createEditorialDocumentSchema.parse(invalid)).toThrow();
    });

    it('rejeita tipo de documento não cadastrado no enum', () => {
      const invalid = {
        title: 'Título Válido',
        content: 'Conteúdo suficientemente longo para o teste.',
        documentType: 'TIPO_INEXISTENTE',
      };
      expect(() => createEditorialDocumentSchema.parse(invalid)).toThrow();
    });
  });

  describe('reviewEditorialDocumentSchema', () => {
    it('permite aprovação com ou sem comentário longo', () => {
      const valid = {
        documentId: '11111111-1111-4111-8111-111111111111',
        decision: 'APPROVE',
        comments: 'Aprovado',
      };
      expect(() => reviewEditorialDocumentSchema.parse(valid)).not.toThrow();
    });

    it('exige comentário com pelo menos 5 caracteres para REJECT', () => {
      const invalid = {
        documentId: '11111111-1111-4111-8111-111111111111',
        decision: 'REJECT',
        comments: 'Não',
      };
      expect(() => reviewEditorialDocumentSchema.parse(invalid)).toThrow();

      const valid = {
        documentId: '11111111-1111-4111-8111-111111111111',
        decision: 'REJECT',
        comments: 'Reprovado devido a informações desatualizadas no desenvolvimento.',
      };
      expect(() => reviewEditorialDocumentSchema.parse(valid)).not.toThrow();
    });

    it('exige comentário com pelo menos 5 caracteres para REQUEST_CHANGES', () => {
      const invalid = {
        documentId: '11111111-1111-4111-8111-111111111111',
        decision: 'REQUEST_CHANGES',
        comments: '123',
      };
      expect(() => reviewEditorialDocumentSchema.parse(invalid)).toThrow();
    });
  });

  describe('publishEditorialDocumentSchema', () => {
    it('exige confirmed estritamente como true', () => {
      expect(() =>
        publishEditorialDocumentSchema.parse({
          documentId: '11111111-1111-4111-8111-111111111111',
          confirmed: false,
        })
      ).toThrow();

      expect(() =>
        publishEditorialDocumentSchema.parse({
          documentId: '11111111-1111-4111-8111-111111111111',
          confirmed: true,
        })
      ).not.toThrow();
    });
  });
});

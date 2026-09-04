import { describe, it, expect } from 'vitest';
import {
  canTransitionEditorialStatus,
  assertValidEditorialTransition,
} from '../../../src/modules/editorial/domain/editorial.rules';
import {
  InvalidEditorialStateTransitionError,
  SelfReviewNotAllowedError,
} from '../../../src/modules/editorial/domain/errors';
import type { EditorialStatus } from '../../../src/modules/editorial/domain/editorial.types';

describe('Editorial State Machine Unit Tests', () => {
  describe('canTransitionEditorialStatus', () => {
    it('permite transições válidas do fluxo canônico', () => {
      expect(canTransitionEditorialStatus('DRAFT', 'IN_REVIEW')).toBe(true);
      expect(canTransitionEditorialStatus('IN_REVIEW', 'APPROVED')).toBe(true);
      expect(canTransitionEditorialStatus('IN_REVIEW', 'CHANGES_REQUESTED')).toBe(true);
      expect(canTransitionEditorialStatus('CHANGES_REQUESTED', 'DRAFT')).toBe(true);
      expect(canTransitionEditorialStatus('CHANGES_REQUESTED', 'IN_REVIEW')).toBe(true);
      expect(canTransitionEditorialStatus('APPROVED', 'PUBLISHED')).toBe(true);
      expect(canTransitionEditorialStatus('APPROVED', 'DRAFT')).toBe(true);
      expect(canTransitionEditorialStatus('PUBLISHED', 'ARCHIVED')).toBe(true);
      expect(canTransitionEditorialStatus('ARCHIVED', 'DRAFT')).toBe(true);
    });

    it('rejeita transições que pulam a revisão humana obrigatória', () => {
      expect(canTransitionEditorialStatus('DRAFT', 'PUBLISHED')).toBe(false);
      expect(canTransitionEditorialStatus('IN_REVIEW', 'PUBLISHED')).toBe(false);
      expect(canTransitionEditorialStatus('CHANGES_REQUESTED', 'PUBLISHED')).toBe(false);
      expect(canTransitionEditorialStatus('ARCHIVED', 'PUBLISHED')).toBe(false);
    });

    it('permite manter o mesmo estado (idempotência)', () => {
      const statuses: EditorialStatus[] = [
        'DRAFT',
        'IN_REVIEW',
        'CHANGES_REQUESTED',
        'APPROVED',
        'PUBLISHED',
        'ARCHIVED',
      ];
      for (const s of statuses) {
        expect(canTransitionEditorialStatus(s, s)).toBe(true);
      }
    });
  });

  describe('assertValidEditorialTransition', () => {
    it('lança erro ao tentar publicar diretamente de DRAFT', () => {
      expect(() =>
        assertValidEditorialTransition('DRAFT', 'PUBLISHED')
      ).toThrow(InvalidEditorialStateTransitionError);
    });

    it('lança erro ao tentar publicar diretamente de IN_REVIEW', () => {
      expect(() =>
        assertValidEditorialTransition('IN_REVIEW', 'PUBLISHED')
      ).toThrow(InvalidEditorialStateTransitionError);
    });

    it('bloqueia ações de IA que tentem aprovar ou publicar conteúdos', () => {
      expect(() =>
        assertValidEditorialTransition('IN_REVIEW', 'APPROVED', { isAiAction: true })
      ).toThrow(InvalidEditorialStateTransitionError);

      expect(() =>
        assertValidEditorialTransition('APPROVED', 'PUBLISHED', { isAiAction: true })
      ).toThrow(InvalidEditorialStateTransitionError);
    });

    it('bloqueia autoaprovação quando o revisor for o mesmo que o autor', () => {
      expect(() =>
        assertValidEditorialTransition('IN_REVIEW', 'APPROVED', {
          isSelfReview: true,
          allowSelfReviewInDev: false,
        })
      ).toThrow(SelfReviewNotAllowedError);
    });

    it('permite aprovação quando o revisor for diferente do autor', () => {
      expect(() =>
        assertValidEditorialTransition('IN_REVIEW', 'APPROVED', {
          isSelfReview: false,
        })
      ).not.toThrow();
    });

    it('permite autoaprovação apenas quando explicitamente configurado para testes de integração unitários', () => {
      expect(() =>
        assertValidEditorialTransition('IN_REVIEW', 'APPROVED', {
          isSelfReview: true,
          allowSelfReviewInDev: true,
        })
      ).not.toThrow();
    });
  });
});

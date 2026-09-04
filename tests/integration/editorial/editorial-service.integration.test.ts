import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import {
  editorialDocuments,
  editorialVersions,
  editorialReviews,
  editorialAiExecutions,
} from '../../../src/lib/db/schema/editorial';
import { auditLogs } from '../../../src/lib/db/schema/audit';
import { editorialService } from '../../../src/modules/editorial/server/editorial.service';
import {
  SelfReviewNotAllowedError,
  MissingReviewCommentError,
  UnauthorizedEditorialAccessError,
  InvalidEditorialStateTransitionError,
  RegulatoryGuardrailBlockedError,
} from '../../../src/modules/editorial/domain/errors';

describe('Integração: Workflow Editorial e IA Interna (Etapa 10)', () => {
  const authorUserId = crypto.randomUUID();
  const reviewerUserId = crypto.randomUUID();
  const thirdPartyUserId = crypto.randomUUID();

  let createdDocId: string;

  beforeAll(async () => {
    const now = new Date();

    // 1. Criar Usuários: Autor, Revisor e Terceiro
    await db.insert(users).values([
      {
        id: authorUserId,
        email: `author_${Date.now()}@carteiraexpert.test`,
        name: 'Autor Editorial',
        passwordHash: 'dummy',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: reviewerUserId,
        email: `reviewer_${Date.now()}@carteiraexpert.test`,
        name: 'Revisor Chefe',
        passwordHash: 'dummy',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: thirdPartyUserId,
        email: `third_${Date.now()}@carteiraexpert.test`,
        name: 'Terceiro Não Autorizado',
        passwordHash: 'dummy',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  afterAll(async () => {
    // Limpeza de tabelas na ordem de dependência
    await db
      .delete(editorialAiExecutions)
      .where(
        inArray(editorialAiExecutions.userId, [
          authorUserId,
          reviewerUserId,
          thirdPartyUserId,
        ])
      );

    await db
      .delete(editorialDocuments)
      .where(
        inArray(editorialDocuments.ownerUserId, [
          authorUserId,
          reviewerUserId,
          thirdPartyUserId,
        ])
      );

    await db
      .delete(auditLogs)
      .where(
        inArray(auditLogs.actorId, [
          authorUserId,
          reviewerUserId,
          thirdPartyUserId,
        ])
      );

    await db
      .delete(users)
      .where(
        inArray(users.id, [authorUserId, reviewerUserId, thirdPartyUserId])
      );
  });

  it('1. Autor cria documento editorial e gera versão 1 imutável com auditoria', async () => {
    const doc = await editorialService.createDocument(authorUserId, {
      title: 'Guia Fundamental sobre Alocação de Ativos',
      content:
        '## Alocação Estratégica\nA alocação de ativos é o principal determinante da rentabilidade e risco da carteira no longo prazo.',
      documentType: 'EDUCATIONAL_ARTICLE',
      visibility: 'INTERNAL',
    });

    expect(doc.id).toBeDefined();
    expect(doc.status).toBe('DRAFT');
    expect(doc.currentVersion).toBe(1);
    expect(doc.ownerUserId).toBe(authorUserId);

    createdDocId = doc.id;

    // Validar integridade física no banco
    const [dbDoc] = await db
      .select()
      .from(editorialDocuments)
      .where(eq(editorialDocuments.id, doc.id));
    expect(dbDoc).toBeDefined();
    expect(dbDoc.title).toBe('Guia Fundamental sobre Alocação de Ativos');

    // Validar criação da versão 1 na tabela editorial_versions
    const versions = await db
      .select()
      .from(editorialVersions)
      .where(eq(editorialVersions.documentId, doc.id));
    expect(versions.length).toBe(1);
    expect(versions[0].versionNumber).toBe(1);
    expect(versions[0].origin).toBe('MANUAL');
    expect(versions[0].contentHash).toBeDefined();

    // Validar trilha de auditoria
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.recordId, doc.id));
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].reason).toBe('EDITORIAL_DOCUMENT_CREATED');
  });

  it('2. Rejeita criação com violação de guardrail (promessa de retorno / lucro garantido)', async () => {
    await expect(
      editorialService.createDocument(authorUserId, {
        title: 'Ganhe Muito Dinheiro',
        content: 'Nossa estratégia garante lucro garantido e retorno certo sem risco para você.',
        documentType: 'EDUCATIONAL_ARTICLE',
      })
    ).rejects.toThrow(RegulatoryGuardrailBlockedError);
  });

  it('3. Autor atualiza rascunho criando a versão 2 com novo hash de conteúdo', async () => {
    const updated = await editorialService.updateDraft(authorUserId, {
      documentId: createdDocId,
      title: 'Guia Fundamental sobre Alocação de Ativos (Revisado)',
      content:
        '## Alocação Estratégica\nA alocação de ativos diversificada reduz o risco específico e estabiliza o patrimônio ao longo dos ciclos econômicos.',
      documentType: 'EDUCATIONAL_ARTICLE',
      notes: 'Adição de detalhes sobre diversificação cíclica.',
    });

    expect(updated.currentVersion).toBe(2);
    expect(updated.status).toBe('DRAFT');

    const versions = await db
      .select()
      .from(editorialVersions)
      .where(eq(editorialVersions.documentId, createdDocId));
    expect(versions.length).toBe(2);
  });

  it('4. Bloqueia edição de rascunho por terceiro não autorizado (anti-IDOR)', async () => {
    await expect(
      editorialService.updateDraft(thirdPartyUserId, {
        documentId: createdDocId,
        title: 'Tentativa de Hack',
        content: 'Conteúdo adulterado sem permissão do autor.',
        documentType: 'EDUCATIONAL_ARTICLE',
      })
    ).rejects.toThrow(UnauthorizedEditorialAccessError);
  });

  it('5. Autor submete documento para revisão humana obrigatória', async () => {
    const submitted = await editorialService.submitForReview(
      authorUserId,
      createdDocId
    );

    expect(submitted.status).toBe('IN_REVIEW');

    const [dbDoc] = await db
      .select()
      .from(editorialDocuments)
      .where(eq(editorialDocuments.id, createdDocId));
    expect(dbDoc.status).toBe('IN_REVIEW');
  });

  it('6. Bloqueia publicação direta sem aprovação prévia', async () => {
    await expect(
      editorialService.publishDocument(authorUserId, createdDocId, true)
    ).rejects.toThrow(InvalidEditorialStateTransitionError);
  });

  it('7. Bloqueia autoaprovação (segregação de funções: autor não pode aprovar a si mesmo)', async () => {
    await expect(
      editorialService.reviewDocument(
        authorUserId,
        {
          documentId: createdDocId,
          decision: 'APPROVE',
          comments: 'Eu mesmo aprovo meu artigo.',
        },
        { allowSelfReview: false }
      )
    ).rejects.toThrow(SelfReviewNotAllowedError);
  });

  it('8. Revisor solicita alterações com justificativa textual obrigatória', async () => {
    // Sem comentário deve falhar
    await expect(
      editorialService.reviewDocument(reviewerUserId, {
        documentId: createdDocId,
        decision: 'REQUEST_CHANGES',
        comments: '',
      })
    ).rejects.toThrow(MissingReviewCommentError);

    // Com comentário justificativo
    const reviewed = await editorialService.reviewDocument(reviewerUserId, {
      documentId: createdDocId,
      decision: 'REQUEST_CHANGES',
      comments:
        'Favor incluir um exemplo prático de carteira balanceada para melhor compreensão dos leitores.',
    });

    expect(reviewed.status).toBe('CHANGES_REQUESTED');
    expect(reviewed.rejectionReason).toContain('exemplo prático');

    // Validar registro em editorial_reviews
    const reviews = await db
      .select()
      .from(editorialReviews)
      .where(eq(editorialReviews.documentId, createdDocId));
    expect(reviews.length).toBe(1);
    expect(reviews[0].decision).toBe('REQUEST_CHANGES');
  });

  it('9. Autor ajusta rascunho (versão 3) e reenvia para revisão', async () => {
    const updated = await editorialService.updateDraft(authorUserId, {
      documentId: createdDocId,
      title: 'Guia Fundamental sobre Alocação de Ativos (Com Exemplos)',
      content:
        '## Alocação Estratégica\nA alocação de ativos balanceada inclui renda fixa pós-fixada, ações brasileiras e exposição cambial.\n\n### Exemplo Prático\nUma alocação 50/50 entre renda fixa e variável protege o capital.',
      documentType: 'EDUCATIONAL_ARTICLE',
      notes: 'Adição do exemplo prático solicitado pela revisão.',
    });

    expect(updated.currentVersion).toBe(3);
    expect(updated.status).toBe('DRAFT');

    const resubmitted = await editorialService.submitForReview(
      authorUserId,
      createdDocId
    );
    expect(resubmitted.status).toBe('IN_REVIEW');
  });

  it('10. Revisor Chefe aprova o documento', async () => {
    const approved = await editorialService.reviewDocument(reviewerUserId, {
      documentId: createdDocId,
      decision: 'APPROVE',
      comments: 'Excelente artigo! Atende plenamente às diretrizes de governança e clareza.',
    });

    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedBy).toBe(reviewerUserId);
    expect(approved.approvedAt).toBeDefined();
  });

  it('11. Autor publica documento aprovado formalmente', async () => {
    const published = await editorialService.publishDocument(
      authorUserId,
      createdDocId,
      true
    );

    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt).toBeDefined();

    const [dbDoc] = await db
      .select()
      .from(editorialDocuments)
      .where(eq(editorialDocuments.id, createdDocId));
    expect(dbDoc.status).toBe('PUBLISHED');
  });

  it('12. Execução de IA interna gera sugestões e registra trilha de auditoria em editorial_ai_executions', async () => {
    const aiResult = (await editorialService.executeAiAssistant(authorUserId, {
      actionType: 'GENERATE_DRAFT',
      prompt: 'Explicação sobre reserva de emergência e Tesouro Selic',
      documentType: 'EDUCATIONAL_ARTICLE',
    })) as any;

    expect(aiResult).toBeDefined();
    expect(aiResult.suggestedTitle).toContain('Artigo Educacional:');
    expect(aiResult.origin).toBe('AI_DRAFT');

    // Validar registro em editorial_ai_executions
    const executions = await db
      .select()
      .from(editorialAiExecutions)
      .where(eq(editorialAiExecutions.userId, authorUserId));
    expect(executions.length).toBeGreaterThanOrEqual(1);
    expect(executions[0].status).toBe('SUCCESS');
    expect(executions[0].model).toBe('mock-editorial-v1');
  });

  it('13. Arquivamento de documento publicado', async () => {
    const archived = await editorialService.archiveDocument(
      authorUserId,
      createdDocId
    );

    expect(archived.status).toBe('ARCHIVED');
    expect(archived.archivedAt).toBeDefined();
  });
});

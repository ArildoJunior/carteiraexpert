// ─── Classes de Erro do Módulo Editorial (Etapa 10) ─────────────────────────

export class EditorialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditorialError';
  }
}

export class EditorialDocumentNotFoundError extends EditorialError {
  constructor(identifier: string) {
    super(`Documento editorial não encontrado: ${identifier}`);
    this.name = 'EditorialDocumentNotFoundError';
  }
}

export class InvalidEditorialStateTransitionError extends EditorialError {
  constructor(currentStatus: string, targetStatus: string, reason?: string) {
    super(
      `Transição de estado editorial inválida de "${currentStatus}" para "${targetStatus}"${
        reason ? `: ${reason}` : '.'
      }`
    );
    this.name = 'InvalidEditorialStateTransitionError';
  }
}

export class SelfReviewNotAllowedError extends EditorialError {
  constructor() {
    super(
      'Segregação de funções violada: o autor do documento não pode aprovar a sua própria criação.'
    );
    this.name = 'SelfReviewNotAllowedError';
  }
}

export class MissingReviewCommentError extends EditorialError {
  constructor(decision: string) {
    super(
      `A decisão de revisão "${decision}" exige justificativa textual obrigatória no campo de comentários.`
    );
    this.name = 'MissingReviewCommentError';
  }
}

export class RegulatoryGuardrailBlockedError extends EditorialError {
  constructor(reasons: string[]) {
    super(
      `Operação bloqueada pelos guardrails regulatórios: ${reasons.join('; ')}`
    );
    this.name = 'RegulatoryGuardrailBlockedError';
  }
}

export class UnauthorizedEditorialAccessError extends EditorialError {
  constructor(message = 'Acesso não autorizado ao documento editorial.') {
    super(message);
    this.name = 'UnauthorizedEditorialAccessError';
  }
}

export class AiProviderExecutionError extends EditorialError {
  constructor(message: string) {
    super(`Falha na execução do assistente editorial de IA: ${message}`);
    this.name = 'AiProviderExecutionError';
  }
}

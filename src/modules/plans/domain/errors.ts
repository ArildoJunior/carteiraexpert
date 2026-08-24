export class PlanLimitExceededError extends Error {
  public readonly planId: string;
  public readonly maxAllowed: number;
  public readonly currentCount: number;

  constructor(
    message = 'Limite de carteiras ativas para o plano atingido.',
    details?: { planId?: string; maxAllowed?: number; currentCount?: number }
  ) {
    super(message);
    this.name = 'PlanLimitExceededError';
    this.planId = details?.planId ?? 'free';
    this.maxAllowed = details?.maxAllowed ?? 2;
    this.currentCount = details?.currentCount ?? 2;
  }
}

export class PortfolioFrozenError extends Error {
  public readonly portfolioId?: string;

  constructor(
    message = 'Operação não permitida: a carteira está congelada (somente leitura).',
    details?: { portfolioId?: string }
  ) {
    super(message);
    this.name = 'PortfolioFrozenError';
    this.portfolioId = details?.portfolioId;
  }
}

export class PlanNotFoundError extends Error {
  constructor(message = 'Plano comercial não encontrado.') {
    super(message);
    this.name = 'PlanNotFoundError';
  }
}

export class InvalidPortfolioStatusTransitionError extends Error {
  constructor(
    message = 'Transição manual para o status congelado (frozen) não é permitida.'
  ) {
    super(message);
    this.name = 'InvalidPortfolioStatusTransitionError';
  }
}

export class GroupCapacityExceededError extends Error {
  constructor(message = 'Capacidade máxima do grupo atingida (máximo de 5 participantes).') {
    super(message);
    this.name = 'GroupCapacityExceededError';
  }
}

export class GroupNotEligibleError extends Error {
  constructor(message = 'Apenas usuários com assinatura ativa do Plano Compartilhado podem administrar grupos.') {
    super(message);
    this.name = 'GroupNotEligibleError';
  }
}

export class GroupNotFoundError extends Error {
  constructor(message = 'Grupo compartilhado não encontrado.') {
    super(message);
    this.name = 'GroupNotFoundError';
  }
}

export class GroupInvitationNotFoundError extends Error {
  constructor(message = 'Convite de grupo não encontrado.') {
    super(message);
    this.name = 'GroupInvitationNotFoundError';
  }
}

export class GroupInvitationExpiredError extends Error {
  constructor(message = 'Este convite de grupo expirou.') {
    super(message);
    this.name = 'GroupInvitationExpiredError';
  }
}

export class GroupInvitationInvalidError extends Error {
  constructor(message = 'Convite de grupo inválido ou já processado.') {
    super(message);
    this.name = 'GroupInvitationInvalidError';
  }
}

export class GroupInviteRateLimitExceededError extends Error {
  constructor(message = 'Limite de 5 convites por hora atingido. Tente novamente mais tarde.') {
    super(message);
    this.name = 'GroupInviteRateLimitExceededError';
  }
}

export class UserAlreadyInGroupError extends Error {
  constructor(message = 'O usuário já possui vínculo ativo com um grupo compartilhado.') {
    super(message);
    this.name = 'UserAlreadyInGroupError';
  }
}

export class GroupMembershipConflictError extends Error {
  constructor(message = 'O usuário já possui vínculo ativo com um grupo compartilhado.') {
    super(message);
    this.name = 'GroupMembershipConflictError';
  }
}

export class GroupOwnerCannotLeaveError extends Error {
  constructor(message = 'O titular não pode deixar o grupo diretamente. Use a dissolução de grupo.') {
    super(message);
    this.name = 'GroupOwnerCannotLeaveError';
  }
}

export class EmailMismatchError extends Error {
  constructor(message = 'O convite foi emitido para outro endereço de e-mail.') {
    super(message);
    this.name = 'EmailMismatchError';
  }
}

export class UnauthorizedGroupOperationError extends Error {
  constructor(message = 'Você não possui permissão para executar esta operação no grupo.') {
    super(message);
    this.name = 'UnauthorizedGroupOperationError';
  }
}

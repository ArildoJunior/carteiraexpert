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

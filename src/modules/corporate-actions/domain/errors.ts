export class InvalidCorporateActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCorporateActionError';
  }
}

export class SubscriptionExpiredError extends Error {
  constructor(message = 'O período de exercício deste direito de subscrição expirou.') {
    super(message);
    this.name = 'SubscriptionExpiredError';
  }
}

export class InsufficientSubscriptionRightsError extends Error {
  constructor(message = 'Quantidade a exercer excede o saldo de direitos disponível.') {
    super(message);
    this.name = 'InsufficientSubscriptionRightsError';
  }
}

export class InvalidSubscriptionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSubscriptionStateError';
  }
}

export class SubscriptionOfferNotFoundError extends Error {
  constructor(message = 'Oferta de subscrição não encontrada ou inativa.') {
    super(message);
    this.name = 'SubscriptionOfferNotFoundError';
  }
}

export class InvalidCostInvariantError extends Error {
  constructor(message = 'Custo total calculado diverge da invariante de exercício.') {
    super(message);
    this.name = 'InvalidCostInvariantError';
  }
}

export class InvalidSubscriptionPeriodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSubscriptionPeriodError';
  }
}

export class InvalidSubscriptionDateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSubscriptionDateError';
  }
}

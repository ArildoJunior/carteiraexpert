export class BillingSubscriptionNotFoundError extends Error {
  constructor(message = 'Assinatura não encontrada.') {
    super(message);
    this.name = 'BillingSubscriptionNotFoundError';
  }
}

export class InvalidSubscriptionStatusTransitionError extends Error {
  constructor(
    message = 'Transição de status de assinatura inválida.'
  ) {
    super(message);
    this.name = 'InvalidSubscriptionStatusTransitionError';
  }
}

export class DuplicatePaymentEventError extends Error {
  public readonly idempotencyKey: string;

  constructor(
    idempotencyKey: string,
    message = `Evento de pagamento duplicado para a chave de idempotência: ${idempotencyKey}`
  ) {
    super(message);
    this.name = 'DuplicatePaymentEventError';
    this.idempotencyKey = idempotencyKey;
  }
}

export class PaymentEventProcessingError extends Error {
  constructor(message = 'Falha ao processar evento de pagamento.') {
    super(message);
    this.name = 'PaymentEventProcessingError';
  }
}

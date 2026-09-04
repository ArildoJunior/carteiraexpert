export class TaxCalculationRunningError extends Error {
  constructor(message = 'Já existe uma apuração fiscal em andamento para este usuário.') {
    super(message);
    this.name = 'TaxCalculationRunningError';
  }
}

export class TaxCalculationError extends Error {
  constructor(message = 'Falha no processamento da apuração fiscal.') {
    super(message);
    this.name = 'TaxCalculationError';
  }
}

export class InvalidTaxPreferencesError extends Error {
  constructor(message = 'Parâmetros de preferências tributárias inválidos.') {
    super(message);
    this.name = 'InvalidTaxPreferencesError';
  }
}

export class TaxYearInFutureError extends Error {
  constructor(message = 'Não é permitido realizar apuração fiscal para datas ou anos no futuro.') {
    super(message);
    this.name = 'TaxYearInFutureError';
  }
}

export class CurrencyMismatchError extends Error {
  constructor(
    message = 'Operações em moedas distintas detectadas sem conversão cambial explícita para BRL.'
  ) {
    super(message);
    this.name = 'CurrencyMismatchError';
  }
}

export class InvalidTaxDateError extends Error {
  constructor(message = 'Data de apuração fiscal inválida.') {
    super(message);
    this.name = 'InvalidTaxDateError';
  }
}

export class InvalidAverageCostError extends Error {
  constructor(message = 'Preço médio de aquisição não pode ser negativo ou zero.') {
    super(message);
    this.name = 'InvalidAverageCostError';
  }
}

export class InvalidTaxQuantityError extends Error {
  constructor(message = 'Quantidade do ativo não pode ser negativa.') {
    super(message);
    this.name = 'InvalidTaxQuantityError';
  }
}

export class TaxUnauthorizedError extends Error {
  constructor(message = 'Acesso não autorizado aos dados fiscais informados.') {
    super(message);
    this.name = 'TaxUnauthorizedError';
  }
}

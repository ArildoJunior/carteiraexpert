export class PortfolioNotFoundError extends Error {
  constructor(message = 'Carteira não encontrada.') {
    super(message);
    this.name = 'PortfolioNotFoundError';
  }
}

export class PortfolioAccessDeniedError extends Error {
  constructor(message = 'Acesso negado à carteira solicitada.') {
    super(message);
    this.name = 'PortfolioAccessDeniedError';
  }
}

export class AssetNotFoundError extends Error {
  constructor(message = 'Ativo não encontrado no catálogo.') {
    super(message);
    this.name = 'AssetNotFoundError';
  }
}

export class InvalidAssetCustomizationError extends Error {
  constructor(message = 'Incoerência na definição de ativo customizado ou global.') {
    super(message);
    this.name = 'InvalidAssetCustomizationError';
  }
}

export class InvalidNumericPrecisionError extends Error {
  constructor(message = 'Valor numérico fora dos limites de precisão ou escala permitidos.') {
    super(message);
    this.name = 'InvalidNumericPrecisionError';
  }
}

export class PortfolioEventNotFoundError extends Error {
  constructor(message = 'Evento de carteira não encontrado.') {
    super(message);
    this.name = 'PortfolioEventNotFoundError';
  }
}

export class DuplicateAssetError extends Error {
  constructor(message = 'Já existe um ativo customizado com este ticker para o usuário.') {
    super(message);
    this.name = 'DuplicateAssetError';
  }
}

export class InsufficientPositionError extends Error {
  public readonly availableQuantity: string;
  public readonly requestedQuantity: string;
  public readonly assetId: string;
  public readonly tradeDate?: Date;

  constructor(
    message: string,
    details?: {
      availableQuantity: string;
      requestedQuantity: string;
      assetId: string;
      tradeDate?: Date;
    }
  ) {
    super(message);
    this.name = 'InsufficientPositionError';
    this.availableQuantity = details?.availableQuantity ?? '0';
    this.requestedQuantity = details?.requestedQuantity ?? '0';
    this.assetId = details?.assetId ?? '';
    this.tradeDate = details?.tradeDate;
  }
}

export class RetroactiveInconsistencyError extends Error {
  public readonly assetId?: string;
  public readonly conflictingDate?: Date;

  constructor(
    message = 'A operação não pode ser concluída pois geraria inconsistência na linha temporal de operações.',
    details?: {
      assetId?: string;
      conflictingDate?: Date;
    }
  ) {
    super(message);
    this.name = 'RetroactiveInconsistencyError';
    this.assetId = details?.assetId;
    this.conflictingDate = details?.conflictingDate;
  }
}

export class FutureDateNotAllowedError extends Error {
  constructor(message = 'A data de referência não pode estar no futuro.') {
    super(message);
    this.name = 'FutureDateNotAllowedError';
  }
}

export class InvalidEvolutionPeriodError extends Error {
  constructor(
    message = 'Período de evolução inválido. Valores aceitos: 1M, 3M, 6M, YTD, 1Y, ALL.'
  ) {
    super(message);
    this.name = 'InvalidEvolutionPeriodError';
  }
}

export class DuplicateRealPortfolioError extends Error {
  constructor(
    message = 'Você já possui uma carteira de Patrimônio Real ativa. Carteiras adicionais devem ter finalidade de Estudo ou Análise.'
  ) {
    super(message);
    this.name = 'DuplicateRealPortfolioError';
  }
}

export class InvalidPortfolioPurposeError extends Error {
  constructor(
    message = 'Finalidade de carteira inválida. Valores aceitos: REAL, ESTUDO, ANALISE.'
  ) {
    super(message);
    this.name = 'InvalidPortfolioPurposeError';
  }
}

export {
  PortfolioFrozenError,
  PlanLimitExceededError,
  PlanNotFoundError,
  InvalidPortfolioStatusTransitionError,
} from '../../plans/domain/errors';


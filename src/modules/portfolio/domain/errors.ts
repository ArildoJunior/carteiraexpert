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

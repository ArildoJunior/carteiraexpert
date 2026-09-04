export class OptionContractNotFoundError extends Error {
  constructor(message = 'Contrato de opção não encontrado ou já excluído.') {
    super(message);
    this.name = 'OptionContractNotFoundError';
  }
}

export class UnderlyingAssetNotFoundError extends Error {
  constructor(message = 'Ativo-objeto não encontrado na carteira.') {
    super(message);
    this.name = 'UnderlyingAssetNotFoundError';
  }
}

export class InvalidOptionParametersError extends Error {
  constructor(message = 'Parâmetros de cálculo de opções inválidos.') {
    super(message);
    this.name = 'InvalidOptionParametersError';
  }
}

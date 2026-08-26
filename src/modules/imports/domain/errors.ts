export class ImportBatchNotFoundError extends Error {
  constructor(message = 'Lote de importação não encontrado.') {
    super(message);
    this.name = 'ImportBatchNotFoundError';
  }
}

export class ImportBatchItemNotFoundError extends Error {
  constructor(message = 'Item do lote de importação não encontrado.') {
    super(message);
    this.name = 'ImportBatchItemNotFoundError';
  }
}

export class ImportBatchNotEditableError extends Error {
  constructor(
    message = 'Este lote de importação não pode mais ser editado pois já foi confirmado ou finalizado.'
  ) {
    super(message);
    this.name = 'ImportBatchNotEditableError';
  }
}

export class ImportFileValidationError extends Error {
  constructor(message = 'Arquivo de importação inválido.') {
    super(message);
    this.name = 'ImportFileValidationError';
  }
}

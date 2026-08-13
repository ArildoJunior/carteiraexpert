export class ConsentRequiredError extends Error {
  constructor(message = 'Consentimento dos termos obrigatórios é exigido.') {
    super(message);
    this.name = 'ConsentRequiredError';
  }
}

export class AuthorizationError extends Error {
  constructor(message = 'Acesso negado ao recurso solicitado.') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

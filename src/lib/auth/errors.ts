export class UnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED" as const;
  readonly statusCode = 401 as const;
  constructor(message = "Usuário não autenticado") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN" as const;
  readonly statusCode = 403 as const;
  constructor(message = "Acesso negado") {
    super(message);
    this.name = "ForbiddenError";
  }
}

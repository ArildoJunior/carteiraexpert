export class InvalidCorporateActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCorporateActionError';
  }
}

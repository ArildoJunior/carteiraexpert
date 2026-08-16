// ─── Interface EmailSenderService ─────────────────────────────────────────────
// Em produção, substituída por implementação SMTP/transacional real.
// Em testes, substituída por TestFakeEmailSender (sem console.log, sem arquivo).
export interface EmailSenderService {
  sendPasswordResetEmail(email: string, token: string): Promise<void>;
}

// ─── Mensagem armazenada pelo fake ───────────────────────────────────────────
export interface FakeEmailMessage {
  to: string;
  token: string;
  sentAt: Date;
}

// ─── TestFakeEmailSender ──────────────────────────────────────────────────────
// SOMENTE para testes unitários e de integração (Vitest, mesmo processo).
// Para testes E2E (Playwright), o token é recuperado diretamente do PostgreSQL
// via DATABASE_URL_TEST — nenhum endpoint público de teste é criado.
//
// PROTEÇÃO EM PRODUÇÃO: a verificação abaixo aborta o processo se este
// adaptador for instanciado com NODE_ENV=production.
export class TestFakeEmailSender implements EmailSenderService {
  // Fila privada — acessível apenas pelos helpers de asserção abaixo
  private readonly _sentEmails: FakeEmailMessage[] = [];

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FATAL: TestFakeEmailSender é estritamente proibido em ambiente de produção.'
      );
    }
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    // Jamais imprime token em console, stdout ou logs.
    this._sentEmails.push({ to: email, token, sentAt: new Date() });
  }

  // ── Helpers de Asserção para Testes ────────────────────────────────────────

  /** Retorna o último e-mail enviado ou null se a fila estiver vazia. */
  getLastSentEmail(): FakeEmailMessage | null {
    return this._sentEmails.at(-1) ?? null;
  }

  /** Retorna todos os e-mails enviados (cópia defensiva). */
  getAllSentEmails(): FakeEmailMessage[] {
    return [...this._sentEmails];
  }

  /** Limpa a fila — útil entre testes. */
  clear(): void {
    this._sentEmails.length = 0;
  }
}

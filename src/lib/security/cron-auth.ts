/**
 * CarteiraExpert — Autenticação Segura para Jobs e Schedulers
 *
 * Valida requisições originadas por agendadores externos (Cloud Scheduler, AWS EventBridge,
 * cron externo ou curl administrativo) para acionamento de endpoints de job.
 *
 * Princípios de Segurança:
 * 1. Autenticação obrigatória por token pré-compartilhado (`CRON_SECRET`).
 * 2. Comparação estrita em tempo constante (`crypto.timingSafeEqual`) para mitigar timing attacks.
 * 3. Rejeição explícita de segredo trafegado em query string (URL parameters).
 * 4. Suporte aos cabeçalhos canônicos `Authorization: Bearer <token>` e `x-cron-secret: <token>`.
 * 5. Em produção, `CRON_SECRET` é estritamente obrigatório e não possui fallback.
 * 6. Zero vazamento de segredos em logs, mensagens de erro ou respostas HTTP.
 */

import crypto from 'node:crypto';

export interface CronAuthResult {
  authenticated: boolean;
  status: number;
  error?: string;
}

export interface MinimalRequest {
  headers: Headers | Record<string, string | string[] | undefined>;
  url?: string;
}

/**
 * Extrai o valor de um cabeçalho a partir de um objeto Headers ou Record simples.
 */
function getHeaderValue(
  headers: Headers | Record<string, string | string[] | undefined>,
  name: string
): string | null {
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name);
  }
  const record = headers as Record<string, string | string[] | undefined>;
  const val = record[name.toLowerCase()] ?? record[name];
  if (Array.isArray(val)) {
    return val[0] ?? null;
  }
  return typeof val === 'string' ? val : null;
}

/**
 * Valida a autenticação de uma requisição para rota de job agendado.
 */
export function validateCronAuth(
  req: MinimalRequest,
  expectedSecretOverride?: string,
  nodeEnv = process.env.NODE_ENV
): CronAuthResult {
  // 1. Verificação de query string: proíbe explicitamente o envio do segredo pela URL
  if (req.url) {
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      const forbiddenParams = ['secret', 'cron_secret', 'token', 'cronsecret', 'key'];
      for (const param of forbiddenParams) {
        if (parsedUrl.searchParams.has(param)) {
          return {
            authenticated: false,
            status: 400,
            error: 'Requisição inválida: o segredo de agendamento não pode ser transmitido via query string (URL). Utilize o cabeçalho Authorization ou x-cron-secret.',
          };
        }
      }
    } catch {
      // Ignora erro de parsing de URL relativa
    }
  }

  const expectedSecret = expectedSecretOverride ?? process.env.CRON_SECRET;

  // 2. Validação da presença do segredo no ambiente do servidor
  if (!expectedSecret || expectedSecret.trim().length === 0) {
    if (nodeEnv === 'production') {
      return {
        authenticated: false,
        status: 500,
        error: 'CRON_SECRET não configurado no ambiente de produção.',
      };
    }
    // Em desenvolvimento ou teste, se não configurado, rejeita com 401 informando configuração pendente
    return {
      authenticated: false,
      status: 401,
      error: 'Autenticação necessária: CRON_SECRET não está configurado.',
    };
  }

  // 3. Extração do token fornecido nos cabeçalhos
  let providedToken: string | null = null;

  const authHeader = getHeaderValue(req.headers, 'authorization');
  if (authHeader) {
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      providedToken = parts[1];
    }
  }

  if (!providedToken) {
    const customHeader = getHeaderValue(req.headers, 'x-cron-secret');
    if (customHeader) {
      providedToken = customHeader.trim();
    }
  }

  if (!providedToken) {
    return {
      authenticated: false,
      status: 401,
      error: 'Acesso não autorizado: credencial de agendamento ausente (forneça Authorization: Bearer <token> ou x-cron-secret).',
    };
  }

  // 4. Comparação em tempo constante (timing-safe)
  const expectedBuf = Buffer.from(expectedSecret);
  const providedBuf = Buffer.from(providedToken);

  // Buffer lengths devem coincidir para timingSafeEqual sem lançar exceção
  if (expectedBuf.length !== providedBuf.length) {
    return {
      authenticated: false,
      status: 401,
      error: 'Acesso não autorizado: credencial de agendamento inválida.',
    };
  }

  const isValid = crypto.timingSafeEqual(expectedBuf, providedBuf);

  if (!isValid) {
    return {
      authenticated: false,
      status: 401,
      error: 'Acesso não autorizado: credencial de agendamento inválida.',
    };
  }

  return {
    authenticated: true,
    status: 200,
  };
}

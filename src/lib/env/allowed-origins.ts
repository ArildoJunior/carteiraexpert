/**
 * CarteiraExpert — Validador e Parser de ALLOWED_ORIGINS
 *
 * Responsável por validar as origens permitidas para requisições mutáveis protegidas
 * por CORS e CSRF, com regras rígidas de segurança por ambiente.
 */

export interface AllowedOriginsValidationResult {
  valid: boolean;
  origins: string[];
  error?: string;
}

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3005',
  'http://127.0.0.1:3005',
];

/**
 * Valida a string bruta de ALLOWED_ORIGINS de acordo com o ambiente de execução.
 *
 * Regras em PRODUÇÃO (nodeEnv === 'production'):
 * 1. A variável é obrigatória, não pode ser undefined e não pode estar vazia ou somente com espaços.
 * 2. Deve conter pelo menos uma origem válida.
 * 3. Cada item deve ser uma URL válida e canônica (apenas protocolo + host + porta opcional, sem path, query ou hash).
 * 4. Não aceita curingas amplos ('*').
 * 5. Não aceita protocolos que não sejam 'https:'.
 * 6. Rejeita configurações que contenham apenas origens HTTP locais (ex: apenas localhost).
 *
 * Regras em DESENVOLVIMENTO / TESTE (nodeEnv !== 'production'):
 * 1. Se a variável for omitida ou vazia, adota as origens locais padrão (localhost/127.0.0.1 nas portas 3000 e 3005).
 * 2. Se informada, valida que cada item seja uma URL válida, permitindo tanto 'http:' quanto 'https:'.
 */
export function validateAllowedOrigins(
  raw: string | undefined,
  nodeEnv: string = process.env.NODE_ENV || 'development'
): AllowedOriginsValidationResult {
  const isProd = nodeEnv === 'production';

  // 1. Verificação de presença e preenchimento
  if (raw === undefined || raw === null || raw.trim() === '') {
    if (isProd) {
      return {
        valid: false,
        origins: [],
        error: 'ALLOWED_ORIGINS é obrigatória e não pode estar vazia em ambiente de produção.',
      };
    }
    // Fallback padrão seguro para desenvolvimento
    return {
      valid: true,
      origins: [...DEFAULT_DEV_ORIGINS],
    };
  }

  const tokens = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    if (isProd) {
      return {
        valid: false,
        origins: [],
        error: 'ALLOWED_ORIGINS não contém nenhuma origem válida após o processamento.',
      };
    }
    return {
      valid: true,
      origins: [...DEFAULT_DEV_ORIGINS],
    };
  }

  const validOrigins: string[] = [];

  // Em testes E2E do Playwright (onde next start roda localmente em modo produção), permite portas locais
  const isE2eTest = process.env.PLAYWRIGHT_TEST === 'true' || process.env.E2E_TEST === 'true';
  const isStrictProduction = isProd && !isE2eTest;

  for (const token of tokens) {
    // 2. Rejeitar curingas
    if (token === '*' || token.includes('*')) {
      return {
        valid: false,
        origins: [],
        error: 'Curingas (*) não são permitidos em ALLOWED_ORIGINS por motivos de segurança.',
      };
    }

    // 3. Validação de formato de URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(token);
    } catch {
      return {
        valid: false,
        origins: [],
        error: `Origem malformada em ALLOWED_ORIGINS: '${token}'.`,
      };
    }

    // 4. Garantir que não contenha pathname, search ou hash
    if (parsedUrl.pathname !== '' && parsedUrl.pathname !== '/') {
      return {
        valid: false,
        origins: [],
        error: `Origem não deve conter caminho (path): '${token}'. Use apenas protocolo e domínio (ex: https://exemplo.com.br).`,
      };
    }
    if (parsedUrl.search) {
      return {
        valid: false,
        origins: [],
        error: `Origem não deve conter parâmetros de busca (query): '${token}'.`,
      };
    }
    if (parsedUrl.hash) {
      return {
        valid: false,
        origins: [],
        error: `Origem não deve conter âncora (hash): '${token}'.`,
      };
    }

    // 5. Verificação de protocolo em produção estrita (não-teste)
    if (isStrictProduction) {
      if (parsedUrl.protocol !== 'https:') {
        return {
          valid: false,
          origins: [],
          error: `Origem insegura em produção: '${token}'. Produção exige obrigatoriamente protocolo HTTPS.`,
        };
      }
    } else {
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return {
          valid: false,
          origins: [],
          error: `Protocolo inválido na origem: '${token}'. Aceitos apenas http: e https:.`,
        };
      }
    }

    // Origem normalizada (origin = protocol + '//' + host)
    validOrigins.push(parsedUrl.origin);
  }

  // 6. Em produção estrita, garantir que não existam apenas origens locais
  if (isStrictProduction) {
    const onlyLocal = validOrigins.every((o) => {
      const hostname = new URL(o).hostname.toLowerCase();
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    });
    if (onlyLocal) {
      return {
        valid: false,
        origins: [],
        error: 'ALLOWED_ORIGINS em produção não pode conter exclusivamente endereços locais (localhost/127.0.0.1).',
      };
    }
  }

  return {
    valid: true,
    origins: validOrigins,
  };
}

/**
 * Retorna o array de origens permitidas.
 * Lança erro fatal se a validação falhar em produção.
 */
export function parseAllowedOrigins(
  raw: string | undefined,
  nodeEnv: string = process.env.NODE_ENV || 'development'
): string[] {
  const result = validateAllowedOrigins(raw, nodeEnv);
  if (!result.valid) {
    throw new Error(result.error || 'ALLOWED_ORIGINS inválida.');
  }
  return result.origins;
}
